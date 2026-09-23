import type { Food, MealConfig, MealKey } from "./types.ts";

export interface LogEntry {
  id: string;
  foodId: string;
  grams: number;
  mealKey: MealKey;
  createdAt: string;
}

export function dateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function entryCalories(
  entry: Pick<LogEntry, "foodId" | "grams">,
  foodsById: ReadonlyMap<string, Food>,
): number {
  const food = foodsById.get(entry.foodId);
  if (!food) return 0;
  return (entry.grams * food.caloriesPer100g) / 100;
}

export function totalConsumed(
  entries: readonly LogEntry[],
  foodsById: ReadonlyMap<string, Food>,
): number {
  return Math.round(
    entries.reduce((sum, entry) => sum + entryCalories(entry, foodsById), 0),
  );
}

export function consumedByMeal(
  entries: readonly LogEntry[],
  foodsById: ReadonlyMap<string, Food>,
): Partial<Record<MealKey, number>> {
  const totals: Partial<Record<MealKey, number>> = {};
  for (const entry of entries) {
    totals[entry.mealKey] =
      (totals[entry.mealKey] ?? 0) + entryCalories(entry, foodsById);
  }
  return totals;
}

// Refeições com registros contam como já comidas e mantêm a meta. As demais
// dividem o orçamento que sobrou do dia na proporção das metas originais.
export function adjustedMeals(
  meals: readonly MealConfig[],
  consumed: Partial<Record<MealKey, number>>,
): MealConfig[] {
  const eatenKeys = new Set(
    Object.keys(consumed).filter((key) => (consumed[key as MealKey] ?? 0) > 0),
  );
  if (eatenKeys.size === 0) return [...meals];
  const remaining = meals.filter((meal) => !eatenKeys.has(meal.key));
  if (remaining.length === 0) return [...meals];
  const daily = meals.reduce((sum, meal) => sum + meal.targetCalories, 0);
  const consumedTotal = Object.values(consumed).reduce((sum, kcal) => sum + kcal, 0);
  const budget = daily - consumedTotal;
  const remainingTarget = remaining.reduce(
    (sum, meal) => sum + meal.targetCalories,
    0,
  );
  const factor =
    remainingTarget > 0 ? Math.max(0, budget / remainingTarget) : 0;
  return meals.map((meal) =>
    eatenKeys.has(meal.key)
      ? meal
      : { ...meal, targetCalories: Math.round(meal.targetCalories * factor) },
  );
}
