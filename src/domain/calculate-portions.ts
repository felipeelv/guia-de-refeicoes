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

interface PortionSlot {
  food: Food;
  share: number;
}

// Alimento contado em unidades (ovo, pão) não cabe em qualquer grama: ele
// fecha primeiro, na unidade inteira ou pela metade, e quem vem depois tem
// como alvo a energia que de fato sobrou da refeição. Sem unidade no prato,
// cada alimento recebe exatamente a sua fatia da meta, como sempre.
function allocatePortions(
  slots: readonly PortionSlot[],
  targetCalories: number,
  personIncrement: number,
): { item: PortionResultItem; calories: number }[] {
  const portions = new Array<{ item: PortionResultItem; calories: number }>(
    slots.length,
  );
  if (!slots.some((slot) => slot.food.unit)) {
    slots.forEach((slot, index) => {
      portions[index] = portionFor(
        slot.food,
        targetCalories * slot.share,
        personIncrement,
      );
    });
    return portions;
  }
  const unitFirst = slots
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number(Boolean(slots[b]!.food.unit)) -
        Number(Boolean(slots[a]!.food.unit)),
    );
  let remaining = targetCalories;
  let pendingShare = slots.reduce((sum, slot) => sum + slot.share, 0);
  for (const index of unitFirst) {
    const slot = slots[index]!;
    const target = pendingShare > 0 ? (remaining * slot.share) / pendingShare : 0;
    const portion = portionFor(slot.food, target, personIncrement);
    portions[index] = portion;
    remaining -= portion.calories;
    pendingShare -= slot.share;
  }
  return portions;
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
  const slots: PortionSlot[] = [
    { food: input.carbohydrateFood, share: carbohydrateShare },
    ...(secondCarbohydrateFood
      ? [{ food: secondCarbohydrateFood, share: carbohydrateShare }]
      : []),
    { food: input.proteinFood, share: input.meal.proteinShare },
  ];

  const portions = allocatePortions(slots, input.meal.targetCalories, increment);
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
