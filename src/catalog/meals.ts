import type { MealConfig } from "../domain/types.ts";
import { assertMealConfigs } from "../domain/validation.ts";

export const MEALS: MealConfig[] = [
  {
    key: "breakfast",
    label: "Café da manhã",
    targetCalories: 400,
    carbohydrateShare: 0.4,
    proteinShare: 0.6,
    order: 1,
  },
  {
    key: "lunch",
    label: "Almoço",
    targetCalories: 550,
    carbohydrateShare: 0.4,
    proteinShare: 0.6,
    order: 2,
  },
  {
    key: "snack",
    label: "Lanche",
    targetCalories: 300,
    carbohydrateShare: 0.4,
    proteinShare: 0.6,
    order: 3,
  },
  {
    key: "dinner",
    label: "Jantar",
    targetCalories: 550,
    carbohydrateShare: 0.4,
    proteinShare: 0.6,
    order: 4,
  },
  {
    key: "supper",
    label: "Ceia",
    targetCalories: 200,
    carbohydrateShare: 0.4,
    proteinShare: 0.6,
    order: 5,
  },
];

assertMealConfigs(MEALS);

export function mealsInOrder(): MealConfig[] {
  return [...MEALS].sort((a, b) => a.order - b.order);
}

export function mealByKey(key: string | undefined): MealConfig | null {
  return MEALS.find((meal) => meal.key === key) ?? null;
}
