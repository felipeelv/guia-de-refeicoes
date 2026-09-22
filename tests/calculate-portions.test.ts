import assert from "node:assert/strict";
import test from "node:test";
import { calculatePortions } from "../src/domain/calculate-portions.ts";
import type { Food, MealConfig, PortionCalculationInput } from "../src/domain/types.ts";
import { PortionCalculationError } from "../src/domain/validation.ts";
import { foods, foodsByCategory } from "../src/catalog/catalog.ts";
import { PERSONS } from "../src/catalog/persons.ts";
import { mealByKey } from "../src/catalog/meals.ts";

function food(
  overrides: Partial<Food> &
    Pick<Food, "id" | "category" | "caloriesPer100g">,
): Food {
  return {
    name: overrides.id,
    meals: ["lunch"],
    preparation: "cozido",
    proteinPer100g: null,
    carbohydratePer100g: null,
    fatPer100g: null,
    source: { name: "TBCA", code: "TEST", accessedAt: "2026-09-22" },
    active: true,
    sortOrder: 1,
    ...overrides,
  };
}

const lunch: MealConfig = {
  key: "lunch",
  label: "Almoço",
  targetCalories: 550,
  carbohydrateShare: 0.4,
  proteinShare: 0.6,
  order: 2,
};

function input(
  overrides: Partial<PortionCalculationInput> = {},
): PortionCalculationInput {
  return {
    meal: lunch,
    carbohydrateFood: food({
      id: "alimento-a",
      category: "carbohydrate",
      caloriesPer100g: 130,
    }),
    proteinFood: food({
      id: "alimento-b",
      category: "protein",
      caloriesPer100g: 180,
    }),
    ...overrides,
  };
}

test("calcula 40/60, gramas, calorias reais e tolerância do exemplo", () => {
  const result = calculatePortions(input());
  assert.equal(result.carbohydrate.grams, 170);
  assert.equal(result.carbohydrate.calories, 221);
  assert.equal(result.protein.grams, 180);
  assert.equal(result.protein.calories, 324);
  assert.equal(result.totalCalories, 545);
  assert.equal(result.differenceCalories, -5);
  assert.equal(result.differencePercent, -5 / 550);
  assert.equal(result.toleranceStatus, "within");
  assert.equal(result.targetCalories, 550);
  assert.equal(result.secondCarbohydrate, null);
  assert.notEqual(result.totalCalories, result.targetCalories);
});

test("dois carboidratos dividem ao meio a energia do carboidrato", () => {
  const withSecond = calculatePortions(
    input({
      secondCarbohydrateFood: food({
        id: "alimento-c",
        category: "carbohydrate",
        caloriesPer100g: 100,
      }),
    }),
  );
  assert.equal(withSecond.carbohydrate.grams, 80);
  assert.equal(withSecond.carbohydrate.calories, 104);
  assert.ok(withSecond.secondCarbohydrate);
  assert.equal(withSecond.secondCarbohydrate.foodId, "alimento-c");
  assert.equal(withSecond.secondCarbohydrate.grams, 110);
  assert.equal(withSecond.secondCarbohydrate.calories, 110);
  assert.equal(withSecond.protein.grams, 180);
  assert.equal(withSecond.totalCalories, 538);
  assert.equal(withSecond.toleranceStatus, "within");

  const alone = calculatePortions(input());
  assert.equal(alone.carbohydrate.grams, 170);
  assert.ok(withSecond.carbohydrate.grams < alone.carbohydrate.grams);
});

test("rejeita segundo carboidrato repetido ou de outra categoria", () => {
  assert.throws(
    () =>
      calculatePortions(
        input({
          secondCarbohydrateFood: food({
            id: "alimento-a",
            category: "carbohydrate",
            caloriesPer100g: 130,
          }),
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          secondCarbohydrateFood: food({
            id: "proteina-no-segundo",
            category: "protein",
            caloriesPer100g: 150,
          }),
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          secondCarbohydrateFood: food({
            id: "sem-energia-2",
            category: "carbohydrate",
            caloriesPer100g: 0,
          }),
        }),
      ),
    PortionCalculationError,
  );
});

test("outra divisão produz porções diferentes das de 40/60", () => {
  const half = calculatePortions(
    input({
      meal: { ...lunch, carbohydrateShare: 0.5, proteinShare: 0.5 },
    }),
  );
  assert.notEqual(half.carbohydrate.grams, 170);
});

test("impede porção de 0 g quando o bruto positivo arredonda para zero", () => {
  const result = calculatePortions(
    input({
      carbohydrateFood: food({
        id: "denso",
        category: "carbohydrate",
        caloriesPer100g: 100_000,
      }),
    }),
  );
  assert.equal(result.carbohydrate.grams, 10);
  assert.ok(result.carbohydrate.grams % 10 === 0);
  assert.ok(result.protein.grams > 0);
});

test("classifica abaixo e acima da margem sem alterar o arredondamento", () => {
  const below = calculatePortions(
    input({
      meal: { ...lunch, targetCalories: 200 },
      carbohydrateFood: food({
        id: "carboidrato-denso",
        category: "carbohydrate",
        caloriesPer100g: 600,
      }),
      proteinFood: food({
        id: "proteina-exata",
        category: "protein",
        caloriesPer100g: 600,
      }),
    }),
  );
  assert.equal(below.carbohydrate.grams, 10);
  assert.equal(below.protein.grams, 20);
  assert.equal(below.toleranceStatus, "below");

  const above = calculatePortions(
    input({
      meal: { ...lunch, targetCalories: 200 },
      carbohydrateFood: food({
        id: "carboidrato-alto",
        category: "carbohydrate",
        caloriesPer100g: 450,
      }),
      proteinFood: food({
        id: "proteina-alta",
        category: "protein",
        caloriesPer100g: 450,
      }),
    }),
  );
  assert.equal(above.carbohydrate.grams, 20);
  assert.equal(above.protein.grams, 30);
  assert.equal(above.toleranceStatus, "above");
});

test("rejeita calorias inválidas, categoria trocada, participação e incremento", () => {
  assert.throws(
    () =>
      calculatePortions(
        input({
          carbohydrateFood: food({
            id: "sem-energia",
            category: "carbohydrate",
            caloriesPer100g: 0,
          }),
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          proteinFood: food({
            id: "negativo",
            category: "protein",
            caloriesPer100g: -5,
          }),
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          carbohydrateFood: food({
            id: "proteina-no-carboidrato",
            category: "protein",
            caloriesPer100g: 150,
          }),
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          meal: { ...lunch, carbohydrateShare: 0.2, proteinShare: 0.2 },
        }),
      ),
    PortionCalculationError,
  );
  assert.throws(
    () => calculatePortions(input({ roundingIncrementGrams: 0 })),
    PortionCalculationError,
  );
  assert.throws(
    () => calculatePortions(input({ roundingIncrementGrams: 2.5 })),
    PortionCalculationError,
  );
  assert.throws(
    () =>
      calculatePortions(
        input({
          proteinFood: food({
            id: "inativa",
            category: "protein",
            caloriesPer100g: 180,
            active: false,
          }),
        }),
      ),
    PortionCalculationError,
  );
});

test("alimento com unidade fecha em meia unidade e o carboidrato absorve a sobra", () => {
  const result = calculatePortions(
    input({
      proteinFood: food({
        id: "ovo-teste",
        category: "protein",
        caloriesPer100g: 125,
        unit: { singular: "ovo", plural: "ovos", gramsPerUnit: 50, stepUnits: 0.5 },
      }),
    }),
  );
  assert.equal(result.protein.grams, 275);
  assert.equal(result.protein.units, 5.5);
  assert.equal(result.protein.unit?.singular, "ovo");
  assert.equal(result.protein.grams % 25, 0);
  assert.equal(result.carbohydrate.units, null);
  assert.equal(result.carbohydrate.unit, null);
  assert.equal(result.carbohydrate.grams, 160);
  assert.equal(result.toleranceStatus, "within");

  const semUnidade = calculatePortions(input());
  assert.equal(semUnidade.carbohydrate.grams, 170);
  assert.equal(semUnidade.protein.units, null);
});

test("ovo do catálogo vira contagem inteira ou meia em todas as refeições reais", () => {
  const egg = foods.find((item) => item.id === "ovo");
  assert.ok(egg);
  assert.equal(egg.unit?.gramsPerUnit, 50);
  for (const person of PERSONS) {
    for (const meal of person.meals) {
      if (!egg.meals.includes(meal.key)) continue;
      for (const carbohydrate of foodsByCategory(
        "carbohydrate",
        meal.key,
        person.excludedTags,
      )) {
        const result = calculatePortions({
          meal,
          carbohydrateFood: carbohydrate,
          proteinFood: egg,
          roundingIncrementGrams: person.roundingIncrementGrams,
        });
        const units = result.protein.units;
        assert.ok(units !== null && units > 0);
        assert.equal((units * 2) % 1, 0, `${person.key}/${meal.key}: ${units}`);
        assert.equal(
          result.toleranceStatus,
          "within",
          `${person.key}/${meal.key} com ${carbohydrate.id}: ${result.differencePercent}`,
        );
      }
    }
  }
});

test("ovo no café da manhã do Felipe: 4 ovos e carboidrato compensando", () => {
  const felipe = PERSONS.find((person) => person.key === "felipe");
  assert.ok(felipe);
  const breakfast = felipe.meals.find((meal) => meal.key === "breakfast");
  assert.ok(breakfast);
  const egg = foods.find((item) => item.id === "ovo");
  const bread = foods.find((item) => item.id === "pao-frances");
  assert.ok(egg && bread);
  const result = calculatePortions({
    meal: breakfast,
    carbohydrateFood: bread,
    proteinFood: egg,
    roundingIncrementGrams: felipe.roundingIncrementGrams,
  });
  assert.equal(result.protein.units, 4);
  assert.equal(result.protein.grams, 200);
  assert.equal(result.protein.calories, 250);
  assert.equal(result.carbohydrate.grams, 50);
  assert.equal(result.toleranceStatus, "within");
});

test("é determinístico e não muta a entrada", () => {
  const current = input();
  const snapshot = structuredClone(current);
  const first = calculatePortions(current);
  const second = calculatePortions(current);
  assert.deepEqual(first, second);
  assert.deepEqual(current, snapshot);
});

test("arroz branco e peito de frango do catálogo fecham o almoço real", () => {
  const meal = mealByKey("lunch");
  assert.ok(meal);
  const rice = foods.find((item) => item.id === "arroz-branco");
  const chicken = foods.find((item) => item.id === "peito-de-frango");
  assert.ok(rice && chicken);
  const result = calculatePortions({
    meal,
    carbohydrateFood: rice,
    proteinFood: chicken,
  });
  assert.equal(result.carbohydrate.grams, 170);
  assert.equal(result.carbohydrate.calories, 223);
  assert.equal(result.protein.grams, 220);
  assert.equal(result.protein.calories, 330);
  assert.equal(result.totalCalories, 553);
  assert.equal(result.differenceCalories, 3);
  assert.equal(result.toleranceStatus, "within");
});

test("arroz com feijão divide o carboidrato do almoço real", () => {
  const meal = mealByKey("lunch");
  assert.ok(meal);
  const rice = foods.find((item) => item.id === "arroz-branco");
  const beans = foods.find((item) => item.id === "feijao-carioca");
  const chicken = foods.find((item) => item.id === "peito-de-frango");
  assert.ok(rice && beans && chicken);
  const result = calculatePortions({
    meal,
    carbohydrateFood: rice,
    secondCarbohydrateFood: beans,
    proteinFood: chicken,
  });
  assert.equal(result.carbohydrate.grams, 80);
  assert.equal(result.carbohydrate.calories, 105);
  assert.ok(result.secondCarbohydrate);
  assert.equal(result.secondCarbohydrate.name, "Feijão carioca");
  assert.equal(result.secondCarbohydrate.grams, 150);
  assert.equal(result.secondCarbohydrate.calories, 107);
  assert.equal(result.protein.grams, 220);
  assert.equal(result.totalCalories, 541);
  assert.equal(result.toleranceStatus, "within");
});
