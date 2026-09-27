import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogIssue,
  energyReviewPending,
  expectedPortionBounds,
  foodsByCategory,
  foodsForMacroOptimization,
  isCompatibleWithRestriction,
  isMacroOptimizationEnabled,
  loadCatalog,
  macroOptimizationIssue,
  portionDomain,
  restrictionKnowledge,
} from "../src/catalog/catalog.ts";
import rawFoods from "../src/catalog/foods.json" with { type: "json" };
import { MEALS, mealsInOrder } from "../src/catalog/meals.ts";
import { DEFAULT_PERSON, PERSONS, personByKey } from "../src/catalog/persons.ts";
import type { Food } from "../src/domain/types.ts";
import { SUPPORTED_RESTRICTIONS } from "../src/domain/types.ts";
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

const CARBOHYDRATE_AUDIT: Record<
  string,
  {
    basis: "available" | "total_including_fiber";
    total: number;
    available: number;
    fiber: number | null;
  }
> = {
  "arroz-branco": { basis: "total_including_fiber", total: 30, available: 28.8, fiber: 1.2 },
  "arroz-integral": { basis: "total_including_fiber", total: 23.5, available: 21.4, fiber: 2.13 },
  "feijao-carioca": { basis: "total_including_fiber", total: 15.3, available: 8.2, fiber: 7.06 },
  "feijao-preto": { basis: "total_including_fiber", total: 14, available: 5.6, fiber: 8.4 },
  "batata-inglesa": { basis: "total_including_fiber", total: 12.3, available: 10.8, fiber: 1.47 },
  "batata-doce": { basis: "total_including_fiber", total: 35.3, available: 31.4, fiber: 3.9 },
  mandioca: { basis: "total_including_fiber", total: 29.7, available: 27.9, fiber: 1.77 },
  macarrao: { basis: "total_including_fiber", total: 34.7, available: 33.5, fiber: 1.17 },
  "pao-frances": { basis: "total_including_fiber", total: 61.6, available: 59, fiber: 2.61 },
  aveia: { basis: "total_including_fiber", total: 64.5, available: 55, fiber: 9.5 },
  tapioca: { basis: "total_including_fiber", total: 71.9, available: 71.7, fiber: 0.2 },
  banana: { basis: "total_including_fiber", total: 26.7, available: 24.5, fiber: 2.24 },
  mamao: { basis: "total_including_fiber", total: 10.7, available: 8.89, fiber: 1.83 },
  maca: { basis: "total_including_fiber", total: 15.2, available: 13.8, fiber: 1.35 },
  "peito-de-frango": { basis: "available", total: 0, available: 0, fiber: 0 },
  patinho: { basis: "available", total: 0, available: 0, fiber: 0 },
  "coxao-mole": { basis: "available", total: 0, available: 0, fiber: 0 },
  "file-mignon": { basis: "available", total: 0, available: 0, fiber: 0 },
  "lombo-suino": { basis: "available", total: 0, available: 0, fiber: 0 },
  tilapia: { basis: "available", total: 0, available: 0, fiber: 0 },
  ovo: { basis: "available", total: 1.38, available: 1.38, fiber: 0 },
  "iogurte-natural": { basis: "available", total: 4.76, available: 4.76, fiber: 0 },
  "leite-integral": { basis: "available", total: 7.16, available: 7.16, fiber: 0 },
  "queijo-minas-frescal": { basis: "available", total: 3.02, available: 3.02, fiber: 0 },
  ricota: { basis: "available", total: 3.79, available: 3.79, fiber: null },
  "castanha-de-caju": { basis: "total_including_fiber", total: 30.2, available: 26.9, fiber: 3.3 },
};

test("auditoria não troca macros já gravados nem trata total como disponível", () => {
  assert.deepEqual(
    foods.filter((food) => food.fatPer100g === null).map((food) => food.id),
    ["maca"],
  );
  for (const food of foods) {
    const audit = CARBOHYDRATE_AUDIT[food.id];
    assert.ok(audit, food.id);
    assert.equal(food.carbohydrateBasis, audit.basis);
    assert.equal(food.carbohydratePer100g, audit.total);
    assert.equal(food.totalCarbohydratePer100g, audit.total);
    assert.equal(food.availableCarbohydratePer100g, audit.available);
    assert.equal(food.fiberPer100g, audit.fiber);
    if (audit.basis === "available") {
      assert.equal(food.carbohydratePer100g, audit.available);
    } else {
      assert.notEqual(food.carbohydratePer100g, audit.available);
      assert.equal(macroOptimizationIssue(food, 10)?.includes("não normalizada"), true);
    }
  }
  const apple = foods.find((food) => food.id === "maca");
  const rice = foods.find((food) => food.id === "arroz-branco");
  const ricotta = foods.find((food) => food.id === "ricota");
  const tapioca = foods.find((food) => food.id === "tapioca");
  assert.ok(apple && rice && ricotta && tapioca);
  assert.equal(apple.fatPer100g, null);
  assert.equal(apple.caloriesPer100g, 59);
  assert.equal(apple.proteinPer100g, 0.29);
  assert.equal(apple.carbohydratePer100g, 15.2);
  assert.equal(ricotta.fiberPer100g, null);
  assert.equal(tapioca.fatPer100g, 0);
  assert.equal(catalogIssue(apple), null);
  assert.equal(isMacroOptimizationEnabled(apple, 10), false);
  assert.match(macroOptimizationIssue(apple, 10) ?? "", /gordura/);
  assert.match(macroOptimizationIssue(apple, 10) ?? "", /não normalizada/);
  assert.equal(energyReviewPending(apple), null);
  assert.match(macroOptimizationIssue(rice, 10) ?? "", /não normalizada/);
  assert.equal(macroOptimizationIssue(rice, 10)?.includes("gordura"), false);
  assert.equal(isMacroOptimizationEnabled(ricotta, 10), true);
});

test("otimização de macros usa uma regra só e deixa o legado ativo", () => {
  const enabled = foodsForMacroOptimization(foods, 10).map((food) => food.id);
  assert.deepEqual(
    enabled,
    foods
      .filter((food) => macroOptimizationIssue(food, 10) === null)
      .map((food) => food.id),
  );
  assert.deepEqual(enabled, [
    "peito-de-frango",
    "patinho",
    "coxao-mole",
    "file-mignon",
    "lombo-suino",
    "tilapia",
    "ovo",
    "iogurte-natural",
    "leite-integral",
    "queijo-minas-frescal",
    "ricota",
  ]);
  for (const increment of [5, 10]) {
    assert.deepEqual(
      foodsForMacroOptimization(foods, increment).map((food) => food.id),
      foods
        .filter((food) => isMacroOptimizationEnabled(food, increment))
        .map((food) => food.id),
    );
  }
  assert.equal(foods.some((food) => food.id === "maca"), true);
  assert.equal(foods.some((food) => food.id === "aveia"), true);
  const beans = foods.find((food) => food.id === "feijao-carioca");
  const chicken = foods.find((food) => food.id === "peito-de-frango");
  assert.ok(beans && chicken);
  assert.match(energyReviewPending(beans) ?? "", /revisão energética/);
  assert.equal(beans.caloriesPer100g, 71);
  assert.equal(energyReviewPending(chicken), null);
  assert.equal(macroOptimizationIssue(beans, 10)?.includes("revisão"), false);
  const egg = foods.find((food) => food.id === "ovo");
  assert.ok(egg);
  const withoutBasis = { ...egg };
  delete withoutBasis.carbohydrateBasis;
  assert.match(macroOptimizationIssue(withoutBasis, 10) ?? "", /não normalizada/);
  assert.match(
    macroOptimizationIssue({ ...egg, carbohydrateBasis: "unspecified" }, 10) ?? "",
    /não normalizada/,
  );
  assert.match(
    macroOptimizationIssue(
      { ...egg, portionBounds: { minimum: 1, maximum: 4, step: 0.5 } },
      10,
    ) ?? "",
    /divergentes/,
  );
});

test("limites de porção fecham no passo e domínio vazio não derruba o catálogo", () => {
  const bread = foods.find((food) => food.id === "pao-frances");
  const egg = foods.find((food) => food.id === "ovo");
  const oats = foods.find((food) => food.id === "aveia");
  const rice = foods.find((food) => food.id === "arroz-branco");
  const chicken = foods.find((food) => food.id === "peito-de-frango");
  assert.ok(bread && egg && oats && rice && chicken);
  for (const food of foods) {
    assert.deepEqual(food.portionBounds, expectedPortionBounds(food));
  }
  assert.deepEqual(portionDomain(bread, 10), {
    ok: true,
    constraints: {
      foodId: "pao-frances",
      minimum: 0.5,
      maximum: 2,
      step: 0.5,
      unit: bread.unit,
    },
  });
  assert.deepEqual(portionDomain(bread, 5), portionDomain(bread, 10));
  assert.deepEqual(portionDomain(egg, 10), {
    ok: true,
    constraints: {
      foodId: "ovo",
      minimum: 0.5,
      maximum: 4,
      step: 0.5,
      unit: egg.unit,
    },
  });
  assert.deepEqual(portionDomain(oats, 10), {
    ok: true,
    constraints: {
      foodId: "aveia",
      minimum: 10,
      maximum: 100,
      step: 10,
      unit: null,
    },
  });
  const oatsStep = portionDomain(oats, 5);
  assert.equal(oatsStep.ok, true);
  if (oatsStep.ok) assert.equal(oatsStep.constraints.step, 5);
  assert.deepEqual(portionDomain(rice, 10), {
    ok: true,
    constraints: {
      foodId: "arroz-branco",
      minimum: 20,
      maximum: 400,
      step: 10,
      unit: null,
    },
  });
  assert.deepEqual(portionDomain(chicken, 5), {
    ok: true,
    constraints: {
      foodId: "peito-de-frango",
      minimum: 20,
      maximum: 300,
      step: 5,
      unit: null,
    },
  });
  const customUnit = {
    ...egg,
    id: "biscoito",
    unit: {
      singular: "biscoito",
      plural: "biscoitos",
      gramsPerUnit: 20,
      stepUnits: 0.5,
    },
    portionBounds: { minimum: 0.6, maximum: 2.4, step: 0.5 },
  };
  assert.equal(expectedPortionBounds(customUnit), null);
  assert.deepEqual(portionDomain(customUnit, 10), {
    ok: true,
    constraints: {
      foodId: "biscoito",
      minimum: 1,
      maximum: 2,
      step: 0.5,
      unit: customUnit.unit,
    },
  });
  const empty = {
    ...customUnit,
    portionBounds: { minimum: 0.2, maximum: 0.3, step: 0.5 },
  };
  assert.doesNotThrow(() => portionDomain(empty, 10));
  const emptyDomain = portionDomain(empty, 10);
  assert.equal(emptyDomain.ok, false);
  if (!emptyDomain.ok) assert.match(emptyDomain.message, /Domínio de porção vazio/);
  assert.match(macroOptimizationIssue(empty, 10) ?? "", /Domínio de porção vazio/);
  assert.equal(macroOptimizationIssue(chicken, 10), null);
  assert.match(macroOptimizationIssue(chicken, 400) ?? "", /Domínio de porção vazio/);
  const withoutOwnBounds = { ...customUnit, portionBounds: undefined };
  assert.match(
    macroOptimizationIssue(withoutOwnBounds, 10) ?? "",
    /Limites de porção próprios ausentes/,
  );
});

test("restrição desconhecida não é compatível e tag ausente não prova ausência", () => {
  const chicken = foods.find((food) => food.id === "peito-de-frango");
  const milk = foods.find((food) => food.id === "leite-integral");
  const bread = foods.find((food) => food.id === "pao-frances");
  const egg = foods.find((food) => food.id === "ovo");
  const fish = foods.find((food) => food.id === "tilapia");
  const nuts = foods.find((food) => food.id === "castanha-de-caju");
  const pasta = foods.find((food) => food.id === "macarrao");
  assert.ok(chicken && milk && bread && egg && fish && nuts && pasta);
  assert.equal(chicken.tags, undefined);
  for (const restriction of SUPPORTED_RESTRICTIONS) {
    assert.equal(restrictionKnowledge(chicken, restriction), "unknown");
    assert.equal(isCompatibleWithRestriction(chicken, restriction), false);
  }
  const { restrictions, ...untagged } = chicken;
  assert.ok(restrictions);
  assert.equal(restrictions.milk, "unknown");
  assert.equal(restrictionKnowledge(untagged, "milk"), "unknown");
  assert.equal(isCompatibleWithRestriction(untagged, "milk"), false);
  assert.equal(restrictionKnowledge(milk, "milk"), "present");
  assert.equal(isCompatibleWithRestriction(milk, "milk"), false);
  assert.equal(restrictionKnowledge(milk, "lactose"), "unknown");
  assert.equal(restrictionKnowledge(bread, "gluten"), "present");
  assert.equal(restrictionKnowledge(pasta, "gluten"), "present");
  assert.equal(restrictionKnowledge(egg, "egg"), "present");
  assert.equal(restrictionKnowledge(fish, "fish"), "present");
  assert.equal(restrictionKnowledge(nuts, "tree_nut"), "present");
  assert.deepEqual(
    foodsByCategory("carbohydrate", "breakfast", [], foods, ["gluten"]).map(
      (food) => food.id,
    ),
    [],
  );
  assert.deepEqual(
    foodsByCategory("protein", "lunch", [], foods, ["milk"]).map((food) => food.id),
    [],
  );
  const cleared = {
    ...chicken,
    restrictions: { ...chicken.restrictions, milk: "verified_absent" as const },
  };
  assert.equal(isCompatibleWithRestriction(cleared, "milk"), true);
  assert.deepEqual(
    foodsByCategory("protein", "lunch", [], [cleared, milk], ["milk"]).map(
      (food) => food.id,
    ),
    ["peito-de-frango"],
  );
  assert.deepEqual(
    foodsByCategory("protein", "lunch", [], foods).map((food) => food.id),
    foodsByCategory("protein", "lunch").map((food) => food.id),
  );
});
