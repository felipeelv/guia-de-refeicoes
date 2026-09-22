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

export function incrementFor(food: Food, personIncrement: number): number {
  if (!food.unit) return personIncrement;
  return food.unit.gramsPerUnit * food.unit.stepUnits;
}

function portionFor(
  food: Food,
  targetCalories: number,
  personIncrement: number,
): { item: PortionResultItem; calories: number } {
  const increment = incrementFor(food, personIncrement);
  const rawGrams = (targetCalories / food.caloriesPer100g) * 100;
  const grams = rawGrams > 0 ? roundToIncrement(rawGrams, increment) : increment;
  const calories = caloriesForPortion(food.caloriesPer100g, grams);
  return {
    item: {
      foodId: food.id,
      name: food.name,
      grams,
      units: food.unit ? grams / food.unit.gramsPerUnit : null,
      unit: food.unit ?? null,
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
  const carbohydrateShare = secondCarbohydrateFood
    ? input.meal.carbohydrateShare / 2
    : input.meal.carbohydrateShare;
  const slots = [
    { food: input.carbohydrateFood, share: carbohydrateShare },
    ...(secondCarbohydrateFood
      ? [{ food: secondCarbohydrateFood, share: carbohydrateShare }]
      : []),
    { food: input.proteinFood, share: input.meal.proteinShare },
  ];

  // Alimento contado em unidades (ovo, por exemplo) não cabe em qualquer
  // grama: ele fecha primeiro, na unidade inteira ou pela metade, e os
  // demais dividem a energia que sobrou da refeição. Sem unidade no prato,
  // cada um recebe exatamente a sua fatia da meta.
  const byUnit = slots.map((slot) =>
    slot.food.unit
      ? portionFor(slot.food, input.meal.targetCalories * slot.share, increment)
      : null,
  );
  const spent = byUnit.reduce((sum, slot) => sum + (slot?.calories ?? 0), 0);
  const remaining = Math.max(input.meal.targetCalories - spent, 0);
  const flexibleShare = slots.reduce(
    (sum, slot, index) => (byUnit[index] ? sum : sum + slot.share),
    0,
  );

  const portions = slots.map((slot, index) => {
    const fixed = byUnit[index];
    if (fixed) return fixed;
    const target = flexibleShare > 0 ? (remaining * slot.share) / flexibleShare : 0;
    return portionFor(slot.food, target, increment);
  });

  const carbohydrate = portions[0]!;
  const secondCarbohydrate = secondCarbohydrateFood ? portions[1]! : null;
  const protein = portions[portions.length - 1]!;

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
