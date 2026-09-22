import assert from "node:assert/strict";
import test from "node:test";
import { catalogIssue, foodsByCategory, loadCatalog } from "../src/catalog/catalog.ts";
import rawFoods from "../src/catalog/foods.json" with { type: "json" };
import { MEALS, mealsInOrder } from "../src/catalog/meals.ts";
import type { Food } from "../src/domain/types.ts";
import {
  PortionCalculationError,
  mealConfigError,
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
    "banana",
    "mamao",
    "maca",
  ]);
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
