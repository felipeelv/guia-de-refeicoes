import { caloriesForPortion, roundDisplay, roundToIncrement } from "./rounding.ts";
import type {
  Food,
  PortionCalculationInput,
  PortionCalculationResult,
  PortionResultItem,
  ToleranceStatus,
} from "./types.ts";
import { validateInput } from "./validation.ts";

export function getToleranceStatus(
  differencePercent: number,
  tolerance: number,
): ToleranceStatus {
  if (differencePercent >= -tolerance && differencePercent <= tolerance) {
    return "within";
  }
  if (differencePercent < -tolerance) return "below";
  return "above";
}

function portionFor(
  food: Food,
  targetCalories: number,
  increment: number,
): { item: PortionResultItem; calories: number } {
  const rawGrams = (targetCalories / food.caloriesPer100g) * 100;
  const grams = roundToIncrement(rawGrams, increment);
  const calories = caloriesForPortion(food.caloriesPer100g, grams);
  return {
    item: {
      foodId: food.id,
      name: food.name,
      grams,
      calories: roundDisplay(calories),
    },
    calories,
  };
}

export function calculatePortions(
  input: PortionCalculationInput,
): PortionCalculationResult {
  validateInput(input);
  const increment = input.roundingIncrementGrams ?? 10;
  const tolerance = input.tolerancePercent ?? 0.05;
  const secondCarbohydrateFood = input.secondCarbohydrateFood ?? null;
  const carbohydrateTarget =
    input.meal.targetCalories * input.meal.carbohydrateShare;
  const perCarbohydrateTarget = secondCarbohydrateFood
    ? carbohydrateTarget / 2
    : carbohydrateTarget;
  const proteinTarget = input.meal.targetCalories * input.meal.proteinShare;

  const carbohydrate = portionFor(
    input.carbohydrateFood,
    perCarbohydrateTarget,
    increment,
  );
  const secondCarbohydrate = secondCarbohydrateFood
    ? portionFor(secondCarbohydrateFood, perCarbohydrateTarget, increment)
    : null;
  const protein = portionFor(input.proteinFood, proteinTarget, increment);

  const totalCalories = roundDisplay(
    carbohydrate.calories + (secondCarbohydrate?.calories ?? 0) + protein.calories,
  );
  const differenceCalories = roundDisplay(
    totalCalories - input.meal.targetCalories,
  );
  const differencePercent = differenceCalories / input.meal.targetCalories;
  return {
    mealKey: input.meal.key,
    targetCalories: input.meal.targetCalories,
    carbohydrate: carbohydrate.item,
    secondCarbohydrate: secondCarbohydrate?.item ?? null,
    protein: protein.item,
    totalCalories,
    differenceCalories,
    differencePercent,
    toleranceStatus: getToleranceStatus(differencePercent, tolerance),
  };
}
