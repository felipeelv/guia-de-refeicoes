import assert from "node:assert/strict";
import test from "node:test";
import { catalogIssue, foodsByCategory, loadCatalog } from "../src/catalog/catalog.ts";
import rawFoods from "../src/catalog/foods.json" with { type: "json" };
import { MEALS, mealsInOrder } from "../src/catalog/meals.ts";
import { DEFAULT_PERSON, PERSONS, personByKey } from "../src/catalog/persons.ts";
import type { Food } from "../src/domain/types.ts";
import {
  PortionCalculationError,
  mealConfigError,
  personConfigError,
} from "../src/domain/validation.ts";

const foods = rawFoods as Food[];

test("catálogo ativo tem identidade, preparo, energia e fonte auditável", () => {
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const food of foods) {
    assert.equal(food.active, true);
    assert.equal(catalogIssue(food), null);
    assert.equal(ids.has(food.id), false);
    ids.add(food.id);
    assert.equal(codes.has(food.source.code), false);
    codes.add(food.source.code);
    assert.ok(food.proteinPer100g === null || food.proteinPer100g >= 0);
    assert.ok(
      food.carbohydratePer100g === null || food.carbohydratePer100g >= 0,
    );
    assert.ok(food.fatPer100g === null || food.fatPer100g >= 0);
  }
  assert.equal(foods.length, 26);
  assert.equal(
    foods.filter((food) => food.category === "carbohydrate").length,
    14,
  );
  assert.equal(foods.filter((food) => food.category === "protein").length, 12);
});

test("unidade caseira é opcional e precisa de nome, gramas e passo válidos", () => {
  const egg = foods.find((food) => food.id === "ovo");
  assert.ok(egg);
  assert.deepEqual(egg.unit, {
    singular: "ovo",
    plural: "ovos",
    gramsPerUnit: 50,
    stepUnits: 0.5,
  });
  const bread = foods.find((food) => food.id === "pao-frances");
  assert.ok(bread);
  assert.deepEqual(bread.unit, {
    singular: "pão",
    plural: "pães",
    gramsPerUnit: 50,
    stepUnits: 0.5,
  });
  assert.deepEqual(
    foods.filter((food) => food.unit !== undefined).map((food) => food.id),
    ["pao-frances", "ovo"],
  );
  assert.equal(catalogIssue({ ...egg, unit: undefined }), null);
  assert.equal(
    catalogIssue({ ...egg, unit: { ...egg.unit!, gramsPerUnit: 0 } }),
    "Gramas por unidade inválidas em ovo.",
  );
  assert.equal(
    catalogIssue({ ...egg, unit: { ...egg.unit!, stepUnits: 2 } }),
    "Passo de unidade inválido em ovo.",
  );
  assert.equal(
    catalogIssue({ ...egg, unit: { ...egg.unit!, plural: " " } }),
    "Unidade sem nome em ovo.",
  );
});

test("cada refeição oferece só alimentos compatíveis com ela", () => {
  for (const meal of MEALS) {
    const carbohydrates = foodsByCategory("carbohydrate", meal.key);
    const proteins = foodsByCategory("protein", meal.key);
    assert.ok(carbohydrates.length > 0, `${meal.key} sem carboidrato.`);
    assert.ok(proteins.length > 0, `${meal.key} sem proteína.`);
    for (const food of [...carbohydrates, ...proteins]) {
      assert.ok(food.meals.includes(meal.key));
    }
  }
  const breakfast = foodsByCategory("carbohydrate", "breakfast").map(
    (food) => food.id,
  );
  assert.deepEqual(breakfast, ["pao-frances", "aveia", "tapioca", "banana", "mamao"]);
  assert.equal(breakfast.includes("arroz-branco"), false);
  assert.equal(
    foodsByCategory("protein", "supper").map((food) => food.id).includes("patinho"),
    false,
  );
  assert.equal(foodsByCategory("carbohydrate", "lunch").length, 8);
  assert.equal(foodsByCategory("protein", "lunch").length, 7);
  const lunchCarbohydrates = foodsByCategory("carbohydrate", "lunch").map(
    (food) => food.id,
  );
  assert.deepEqual(lunchCarbohydrates.slice(0, 4), [
    "arroz-branco",
    "arroz-integral",
    "feijao-carioca",
    "feijao-preto",
  ]);
  assert.deepEqual(foodsByCategory("carbohydrate", "supper").map((f) => f.id), [
    "aveia",
    "tapioca",
    "banana",
    "mamao",
    "maca",
  ]);
});

test("frutas têm tag e ficam fora do cardápio de quem exclui a tag", () => {
  const fruits = foods.filter((food) => food.tags?.includes("fruit"));
  assert.deepEqual(
    fruits.map((food) => food.id),
    ["banana", "mamao", "maca"],
  );
  assert.equal(
    catalogIssue({ ...(foods[0] as Food), tags: ["doce" as never] }),
    "Tag inválida em arroz-branco: doce.",
  );
  const withoutFruit = foodsByCategory("carbohydrate", "breakfast", ["fruit"]);
  assert.deepEqual(
    withoutFruit.map((food) => food.id),
    ["pao-frances", "aveia", "tapioca"],
  );
  assert.deepEqual(
    foodsByCategory("carbohydrate", "snack", ["fruit"]).map((food) => food.id),
    ["aveia", "tapioca"],
  );
  assert.deepEqual(
    foodsByCategory("carbohydrate", "supper", ["fruit"]).map((food) => food.id),
    ["aveia", "tapioca"],
  );
  assert.equal(foodsByCategory("carbohydrate", "lunch", ["fruit"]).length, 8);
  assert.deepEqual(
    foodsByCategory("carbohydrate", "supper", []).map((food) => food.id),
    foodsByCategory("carbohydrate", "supper").map((food) => food.id),
  );
});

test("Felipe, Gabriela e Kelly têm metas fechadas, alimentos por refeição e arredondamento próprio", () => {
  assert.equal(personConfigError(PERSONS), null);
  assert.deepEqual(
    PERSONS.map((person) => [person.key, person.name, person.dailyCalories]),
    [
      ["felipe", "Felipe", 2000],
      ["gabriela", "Ana Gabriela", 1200],
      ["kelly", "Kelly", 1300],
    ],
  );
  assert.equal(DEFAULT_PERSON.key, "felipe");
  assert.equal(personByKey("ninguem"), null);
  assert.equal(personByKey(undefined), null);

  const felipe = personByKey("felipe");
  const gabriela = personByKey("gabriela");
  assert.ok(felipe && gabriela);
  assert.deepEqual(felipe.excludedTags, ["fruit"]);
  assert.deepEqual(gabriela.excludedTags, []);
  assert.equal(felipe.roundingIncrementGrams, 10);
  assert.equal(gabriela.roundingIncrementGrams, 5);
  assert.deepEqual(
    mealsInOrder(gabriela.meals).map((meal) => [meal.label, meal.targetCalories]),
    [
      ["Café da manhã", 240],
      ["Almoço", 330],
      ["Lanche", 180],
      ["Jantar", 330],
      ["Ceia", 120],
    ],
  );
  const kelly = personByKey("kelly");
  assert.ok(kelly);
  assert.deepEqual(kelly.excludedTags, []);
  assert.equal(kelly.roundingIncrementGrams, 5);
  assert.deepEqual(
    mealsInOrder(kelly.meals).map((meal) => [meal.label, meal.targetCalories]),
    [
      ["Café da manhã", 260],
      ["Almoço", 355],
      ["Lanche", 200],
      ["Jantar", 355],
      ["Ceia", 130],
    ],
  );
  for (const person of PERSONS) {
    for (const meal of person.meals) {
      assert.equal(meal.carbohydrateShare, 0.4);
      assert.ok(
        foodsByCategory("carbohydrate", meal.key, person.excludedTags).length > 0,
        `${person.key} sem carboidrato em ${meal.key}.`,
      );
      assert.ok(
        foodsByCategory("protein", meal.key, person.excludedTags).length > 0,
        `${person.key} sem proteína em ${meal.key}.`,
      );
    }
  }
  assert.match(
    personConfigError([{ ...gabriela, dailyCalories: 1300 }]) ?? "",
    /somam 1200 kcal, não 1300/,
  );
  assert.match(
    personConfigError([felipe, { ...gabriela, key: "felipe" }]) ?? "",
    /repetida/,
  );
  assert.match(
    personConfigError([{ ...felipe, roundingIncrementGrams: 2.5 }]) ?? "",
    /Incremento/,
  );
  assert.match(personConfigError([]) ?? "", /Nenhuma pessoa/);
});

test("registro inválido ou inativo fica fora da seleção", () => {
  const invalid = {
    ...(foods[0] as Food),
    id: "invalido",
    caloriesPer100g: 0,
  };
  const inactive = { ...(foods[1] as Food), id: "oculto", active: false };
  const loaded = loadCatalog([invalid, inactive, foods[2] as Food]);
  assert.deepEqual(
    loaded.active.map((food) => food.id),
    ["feijao-carioca"],
  );
  assert.equal(loaded.problems.length, 1);
});

test("metas fixas e invariantes das cinco refeições", () => {
  assert.equal(mealConfigError(MEALS), null);
  assert.deepEqual(
    mealsInOrder().map((meal) => [meal.label, meal.targetCalories]),
    [
      ["Café da manhã", 400],
      ["Almoço", 550],
      ["Lanche", 300],
      ["Jantar", 550],
      ["Ceia", 200],
    ],
  );
  assert.throws(
    () => {
      const broken = MEALS.map((meal) =>
        meal.key === "lunch"
          ? { ...meal, carbohydrateShare: 0.9, proteinShare: 0.9 }
          : meal,
      );
      const error = mealConfigError(broken);
      if (error) throw new PortionCalculationError(error);
    },
    PortionCalculationError,
  );
});
