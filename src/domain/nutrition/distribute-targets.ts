import type { MealKey, MealNutritionTarget, NutritionTargets } from "../types.ts";

export const MEAL_KEYS = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
] as const satisfies readonly MealKey[];

const SHARE_SUM_EPSILON = 1e-6;

export interface MealCalorieWeight {
  key: MealKey;
  targetCalories: number;
}

function copyShares(
  shares: Readonly<Record<MealKey, number>>,
): Record<MealKey, number> {
  return {
    breakfast: shares.breakfast,
    lunch: shares.lunch,
    snack: shares.snack,
    dinner: shares.dinner,
    supper: shares.supper,
  };
}

/** A ceia absorve o resíduo para a soma das participações ser exatamente 1. */
function withExactSum(shares: Record<MealKey, number>): Record<MealKey, number> {
  const next = { ...shares };
  let others = 0;
  for (const key of MEAL_KEYS) {
    if (key === "supper") continue;
    others += next[key];
  }
  next.supper = 1 - others;
  return next;
}

function explicitSharesValid(
  shares: Readonly<Record<MealKey, number>> | null,
): shares is Readonly<Record<MealKey, number>> {
  if (shares == null) return false;
  let sum = 0;
  for (const key of MEAL_KEYS) {
    const share = shares[key];
    if (!Number.isFinite(share) || share <= 0) return false;
    sum += share;
  }
  return Math.abs(sum - 1) <= SHARE_SUM_EPSILON;
}

function legacyShares(
  baseMeals: readonly MealCalorieWeight[],
): Record<MealKey, number> | null {
  if (baseMeals.length !== MEAL_KEYS.length) return null;
  const seen = new Set<MealKey>();
  let sum = 0;
  for (const meal of baseMeals) {
    if (seen.has(meal.key) || !MEAL_KEYS.includes(meal.key)) return null;
    if (!Number.isFinite(meal.targetCalories) || meal.targetCalories <= 0) return null;
    seen.add(meal.key);
    sum += meal.targetCalories;
  }
  if (seen.size !== MEAL_KEYS.length || !(sum > 0)) return null;
  const shares = {} as Record<MealKey, number>;
  for (const meal of baseMeals) {
    shares[meal.key] = meal.targetCalories / sum;
  }
  return shares;
}

/**
 * Pesos da meta antiga quando a distribuição é válida.
 * Caso contrário, usa as participações de fallback da política.
 * Participações informadas na avaliação, se somarem 100%, têm precedência.
 */
export function resolveMealShares(
  baseMeals: readonly MealCalorieWeight[],
  explicitShares: Readonly<Record<MealKey, number>> | null,
  fallback: Readonly<Record<MealKey, number>>,
): Record<MealKey, number> {
  if (explicitSharesValid(explicitShares)) {
    return withExactSum(copyShares(explicitShares));
  }
  const legacy = legacyShares(baseMeals);
  if (legacy) return withExactSum(legacy);
  return withExactSum(copyShares(fallback));
}

/**
 * Aplica o mesmo peso a calorias e aos três macros.
 * A última refeição recebe o resíduo para a soma igualar o total interno.
 */
export function distributeTargets(
  daily: NutritionTargets,
  shares: Readonly<Record<MealKey, number>>,
): MealNutritionTarget[] {
  const normalized = withExactSum(copyShares(shares));
  const allocated = {
    calories: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
  };

  return MEAL_KEYS.map((mealKey, index) => {
    const last = index === MEAL_KEYS.length - 1;
    const share = normalized[mealKey];
    const take = (
      total: number,
      field: keyof typeof allocated,
    ): number => {
      if (last) return total - allocated[field];
      const value = total * share;
      allocated[field] += value;
      return value;
    };
    return {
      mealKey,
      share,
      calories: take(daily.calories, "calories"),
      proteinGrams: take(daily.proteinGrams, "proteinGrams"),
      carbohydrateGrams: take(daily.carbohydrateGrams, "carbohydrateGrams"),
      fatGrams: take(daily.fatGrams, "fatGrams"),
    };
  });
}

/**
 * Inteiros de exibição. O resíduo do arredondamento vai para as maiores
 * frações; empate fica com o índice menor. Não altera os valores internos.
 */
export function distributeDisplayIntegers(values: readonly number[]): number[] {
  const floors = values.map((value) => Math.floor(value));
  const total = values.reduce((sum, value) => sum + value, 0);
  let residue = Math.round(total) - floors.reduce((sum, value) => sum + value, 0);
  const result = [...floors];
  if (residue === 0 || values.length === 0) return result;

  const ranked = values
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value),
    }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  const step = residue > 0 ? 1 : -1;
  let remaining = Math.abs(residue);
  let cursor = 0;
  while (remaining > 0 && cursor < values.length) {
    const target = ranked[cursor];
    if (!target) break;
    result[target.index] += step;
    remaining -= 1;
    cursor += 1;
  }
  return result;
}
