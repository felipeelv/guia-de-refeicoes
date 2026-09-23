import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustedMeals,
  consumedByMeal,
  dateKey,
  entryCalories,
  totalConsumed,
  type LogEntry,
} from "../src/domain/day-log.ts";
import type { Food, MealConfig } from "../src/domain/types.ts";

function food(
  overrides: Partial<Food> & Pick<Food, "id" | "category" | "name">,
): Food {
  return {
    meals: ["lunch"],
    preparation: "cozido, sem óleo",
    caloriesPer100g: 130,
    proteinPer100g: 2,
    carbohydratePer100g: 28,
    fatPer100g: 0.4,
    source: {
      name: "TBCA",
      code: "TESTE",
      url: "https://www.tbca.net.br/",
      accessedAt: "2026-09-23",
    },
    active: true,
    sortOrder: 1,
    ...overrides,
  };
}

const rice = food({
  id: "arroz",
  name: "Arroz branco",
  category: "carbohydrate",
  caloriesPer100g: 130,
});
const chicken = food({
  id: "frango",
  name: "Peito de frango",
  category: "protein",
  caloriesPer100g: 150,
});

const foodsById = new Map<string, Food>([
  [rice.id, rice],
  [chicken.id, chicken],
]);

const MEALS: MealConfig[] = [
  { key: "breakfast", label: "Café da manhã", targetCalories: 400, carbohydrateShare: 0.4, proteinShare: 0.6, order: 1 },
  { key: "lunch", label: "Almoço", targetCalories: 550, carbohydrateShare: 0.4, proteinShare: 0.6, order: 2 },
  { key: "snack", label: "Lanche", targetCalories: 300, carbohydrateShare: 0.4, proteinShare: 0.6, order: 3 },
  { key: "dinner", label: "Jantar", targetCalories: 550, carbohydrateShare: 0.4, proteinShare: 0.6, order: 4 },
  { key: "supper", label: "Ceia", targetCalories: 200, carbohydrateShare: 0.4, proteinShare: 0.6, order: 5 },
];

function entry(overrides: Partial<LogEntry> & Pick<LogEntry, "foodId" | "grams" | "mealKey">): LogEntry {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...overrides };
}

test("dateKey formata como yyyy-mm-dd no fuso local", () => {
  assert.equal(dateKey(new Date(2026, 8, 23)), "2026-09-23");
  assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("entryCalories usa as calorias por 100 g do alimento", () => {
  assert.equal(entryCalories({ foodId: "arroz", grams: 500 }, foodsById), 650);
  assert.equal(entryCalories({ foodId: "frango", grams: 220 }, foodsById), 330);
  assert.equal(entryCalories({ foodId: "desconhecido", grams: 100 }, foodsById), 0);
});

test("totalConsumed soma e arredonda", () => {
  const entries = [
    entry({ foodId: "arroz", grams: 500, mealKey: "lunch" }),
    entry({ foodId: "frango", grams: 220, mealKey: "lunch" }),
  ];
  assert.equal(totalConsumed(entries, foodsById), 980);
  assert.equal(totalConsumed([], foodsById), 0);
});

test("consumedByMeal agrupa por refeição", () => {
  const entries = [
    entry({ foodId: "arroz", grams: 500, mealKey: "lunch" }),
    entry({ foodId: "frango", grams: 220, mealKey: "lunch" }),
    entry({ foodId: "arroz", grams: 100, mealKey: "dinner" }),
  ];
  const consumed = consumedByMeal(entries, foodsById);
  assert.equal(Math.round(consumed.lunch ?? 0), 980);
  assert.equal(Math.round(consumed.dinner ?? 0), 130);
  assert.equal(consumed.breakfast, undefined);
});

test("adjustedMeals sem registros mantém as metas", () => {
  const adjusted = adjustedMeals(MEALS, {});
  assert.deepEqual(
    adjusted.map((meal) => meal.targetCalories),
    [400, 550, 300, 550, 200],
  );
});

test("adjustedMeals reescalona as refeições restantes na proporção", () => {
  const adjusted = adjustedMeals(MEALS, { lunch: 650 });
  const byKey = new Map(adjusted.map((meal) => [meal.key, meal.targetCalories]));
  assert.equal(byKey.get("lunch"), 550);
  assert.equal(byKey.get("breakfast"), Math.round(400 * (1350 / 1450)));
  assert.equal(byKey.get("snack"), Math.round(300 * (1350 / 1450)));
  assert.equal(byKey.get("dinner"), 512);
  assert.equal(byKey.get("supper"), Math.round(200 * (1350 / 1450)));
});

test("adjustedMeals aumenta as porções quando se come menos que a meta", () => {
  const adjusted = adjustedMeals(MEALS, { lunch: 400 });
  const byKey = new Map(adjusted.map((meal) => [meal.key, meal.targetCalories]));
  assert.equal(byKey.get("dinner"), Math.round(550 * (1600 / 1450)));
});

test("adjustedMeals zera as metas restantes quando o consumo estoura o dia", () => {
  const adjusted = adjustedMeals(MEALS, { lunch: 2500 });
  const byKey = new Map(adjusted.map((meal) => [meal.key, meal.targetCalories]));
  assert.equal(byKey.get("lunch"), 550);
  assert.equal(byKey.get("dinner"), 0);
  assert.equal(byKey.get("supper"), 0);
});

test("adjustedMeals com todas as refeições registradas mantém as metas", () => {
  const consumed = { breakfast: 400, lunch: 550, snack: 300, dinner: 550, supper: 200 };
  const adjusted = adjustedMeals(MEALS, consumed);
  assert.deepEqual(
    adjusted.map((meal) => meal.targetCalories),
    [400, 550, 300, 550, 200],
  );
});
