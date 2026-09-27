import type {
  CalculationPolicyId,
  DayNutritionSummary,
  DayPlanSnapshot,
  Diagnostic,
  MealKey,
  MealNutritionTarget,
  RebalanceResult,
} from "../types.ts";
import { MACRO_TARGETS_NOT_CONFIGURED } from "./summarize-nutrition.ts";

/** Limite de estabilidade do alvo energético operacional de cada refeição pendente. */
export const MIN_PENDING_ENERGY_RATIO = 0.5;
export const MAX_PENDING_ENERGY_RATIO = 1.5;

const EPSILON = 1e-9;

export const DAY_TARGET_MET_MESSAGE = "A meta de energia do dia foi atingida.";
export const DAY_TARGET_EXCEEDED_MESSAGE = "A meta de energia do dia foi ultrapassada.";

interface WeightedMeal {
  mealKey: MealKey;
  share: number;
  calories: number;
}

function diagnostic(code: string, message: string): Diagnostic {
  return { code, message };
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function weightOf(meal: WeightedMeal, shareSum: number, calorieSum: number): number {
  if (shareSum > 0) return meal.share;
  if (calorieSum > 0) return meal.calories;
  return 1;
}

function distributePositive(
  budget: number,
  meals: readonly WeightedMeal[],
  clamp: boolean,
): { amounts: Map<MealKey, number>; unallocated: number; limited: boolean } {
  const amounts = new Map<MealKey, number>();
  if (meals.length === 0) {
    return {
      amounts,
      unallocated: budget > EPSILON ? budget : 0,
      limited: budget > EPSILON,
    };
  }
  const shareSum = meals.reduce((sum, meal) => sum + Math.max(0, meal.share), 0);
  const calorieSum = meals.reduce((sum, meal) => sum + Math.max(0, meal.calories), 0);
  const weightSum = meals.reduce(
    (sum, meal) => sum + weightOf(meal, shareSum, calorieSum),
    0,
  );
  for (const meal of meals) {
    const weight = weightOf(meal, shareSum, calorieSum);
    amounts.set(meal.mealKey, weightSum > 0 ? (budget * weight) / weightSum : budget / meals.length);
  }
  if (!clamp) {
    for (const meal of meals) amounts.set(meal.mealKey, nonNegative(amounts.get(meal.mealKey) ?? 0));
    return { amounts, unallocated: 0, limited: false };
  }

  const minimum = (meal: WeightedMeal) => MIN_PENDING_ENERGY_RATIO * meal.calories;
  const maximum = (meal: WeightedMeal) => MAX_PENDING_ENERGY_RATIO * meal.calories;
  let limited = false;

  for (let guard = 0; guard < 8; guard += 1) {
    let surplus = 0;
    for (const meal of meals) {
      const current = amounts.get(meal.mealKey) ?? 0;
      const cap = maximum(meal);
      if (current > cap + EPSILON) {
        surplus += current - cap;
        amounts.set(meal.mealKey, cap);
      }
    }
    if (surplus <= EPSILON) break;
    const room = meals.filter((meal) => (amounts.get(meal.mealKey) ?? 0) < maximum(meal) - EPSILON);
    const roomTotal = room.reduce(
      (sum, meal) => sum + (maximum(meal) - (amounts.get(meal.mealKey) ?? 0)),
      0,
    );
    if (room.length === 0 || roomTotal <= EPSILON) {
      limited = true;
      break;
    }
    const placed = Math.min(surplus, roomTotal);
    for (const meal of room) {
      const current = amounts.get(meal.mealKey) ?? 0;
      const capacity = maximum(meal) - current;
      amounts.set(meal.mealKey, current + (placed * capacity) / roomTotal);
    }
  }

  for (let guard = 0; guard < 8; guard += 1) {
    const needy = meals.filter((meal) => (amounts.get(meal.mealKey) ?? 0) < minimum(meal) - EPSILON);
    const donors = meals.filter((meal) => (amounts.get(meal.mealKey) ?? 0) > minimum(meal) + EPSILON);
    if (needy.length === 0 || donors.length === 0) break;
    const gaps = needy.map((meal) => minimum(meal) - (amounts.get(meal.mealKey) ?? 0));
    const excesses = donors.map((meal) => (amounts.get(meal.mealKey) ?? 0) - minimum(meal));
    const need = gaps.reduce((sum, gap) => sum + gap, 0);
    const available = excesses.reduce((sum, excess) => sum + excess, 0);
    const moved = Math.min(need, available);
    if (moved <= EPSILON) break;
    donors.forEach((meal, index) => {
      const current = amounts.get(meal.mealKey) ?? 0;
      amounts.set(meal.mealKey, current - (moved * excesses[index]!) / available);
    });
    needy.forEach((meal, index) => {
      const current = amounts.get(meal.mealKey) ?? 0;
      const next = current + (moved * gaps[index]!) / need;
      amounts.set(meal.mealKey, Math.min(maximum(meal), next));
    });
  }

  for (const meal of meals) {
    const value = nonNegative(amounts.get(meal.mealKey) ?? 0);
    amounts.set(meal.mealKey, value);
    if (value < minimum(meal) - 1e-6 || value > maximum(meal) + 1e-6) limited = true;
  }
  const allocated = meals.reduce((sum, meal) => sum + (amounts.get(meal.mealKey) ?? 0), 0);
  const rawUnallocated = budget - allocated;
  const unallocated = Math.abs(rawUnallocated) <= 1e-8 ? 0 : rawUnallocated;
  if (unallocated > EPSILON) limited = true;
  return { amounts, unallocated, limited };
}

function macroAmount(
  balance: number | null,
  meals: readonly WeightedMeal[],
  pick: (meal: MealNutritionTarget) => number,
  baseMeals: readonly MealNutritionTarget[],
): Map<MealKey, number> | null {
  if (balance == null || !Number.isFinite(balance) || balance <= 0) return null;
  const weighted = meals.map((meal) => {
    const base = baseMeals.find((item) => item.mealKey === meal.mealKey);
    return { ...meal, calories: base ? pick(base) : meal.calories };
  });
  return distributePositive(balance, weighted, false).amounts;
}

/**
 * Redistribui só refeições pendentes. Não altera o snapshot nem a meta-base.
 * Excesso não vira dívida do dia seguinte: o resultado é só deste dia.
 */
export function rebalanceRemainingMeals(
  daySnapshot: DayPlanSnapshot,
  summary: DayNutritionSummary,
  policyId: CalculationPolicyId,
): RebalanceResult {
  const diagnostics: Diagnostic[] = [];
  if (policyId !== "experimental-v1") {
    diagnostics.push(
      diagnostic(
        "unknown_policy",
        `A política ${policyId} não é a experimental-v1. As regras de saldo desta versão foram mantidas.`,
      ),
    );
  }

  const pending = new Set(summary.pendingMealKeys);
  const pendingMeals = daySnapshot.baseMeals.filter((meal) => pending.has(meal.mealKey));
  const personalized = daySnapshot.plan.origin === "confirmed";
  const energyBalance = summary.balances.calories;
  const energyKnown = Number.isFinite(energyBalance);
  let energyAmounts: Map<MealKey, number> | null = null;
  let unallocatedCalories = 0;

  if (!energyKnown) {
    diagnostics.push(
      diagnostic(
        "energy_coverage_partial",
        "A energia do dia está incompleta. O saldo energético não foi redistribuído.",
      ),
    );
  } else if (energyBalance <= 0) {
    diagnostics.push(
      diagnostic(
        energyBalance === 0 ? "day_target_met" : "day_target_exceeded",
        energyBalance === 0 ? DAY_TARGET_MET_MESSAGE : DAY_TARGET_EXCEEDED_MESSAGE,
      ),
    );
  } else {
    const distributed = distributePositive(energyBalance, pendingMeals, personalized);
    energyAmounts = distributed.amounts;
    unallocatedCalories = distributed.unallocated;
    if (distributed.unallocated > EPSILON) {
      diagnostics.push(
        diagnostic(
          "energy_unallocated",
          "Parte do saldo de energia não coube nas refeições pendentes dentro de 50% a 150% da meta-base.",
        ),
      );
    } else if (distributed.limited) {
      diagnostics.push(
        diagnostic(
          "rebalance_limited",
          "Os limites de 50% a 150% impediram manter cada refeição pendente nessa faixa.",
        ),
      );
    }
  }

  const legacyCaloriesOnly = daySnapshot.plan.origin !== "confirmed";
  const macrosEnabled =
    !legacyCaloriesOnly && summary.macroTargetsConfigured && summary.coverage === "complete";
  if (legacyCaloriesOnly || !summary.macroTargetsConfigured) {
    diagnostics.push(
      diagnostic("macro_targets_not_configured", MACRO_TARGETS_NOT_CONFIGURED),
    );
  } else if (!macrosEnabled) {
    diagnostics.push(
      diagnostic(
        "macro_rebalance_disabled",
        "A cobertura de macros está incompleta. O rebalanceamento de macros fica desligado.",
      ),
    );
  }

  const proteinAmounts = macrosEnabled
    ? macroAmount(summary.balances.proteinGrams, pendingMeals, (meal) => meal.proteinGrams, daySnapshot.baseMeals)
    : null;
  const carbohydrateAmounts = macrosEnabled
    ? macroAmount(
        summary.balances.carbohydrateGrams,
        pendingMeals,
        (meal) => meal.carbohydrateGrams,
        daySnapshot.baseMeals,
      )
    : null;
  const fatAmounts = macrosEnabled
    ? macroAmount(summary.balances.fatGrams, pendingMeals, (meal) => meal.fatGrams, daySnapshot.baseMeals)
    : null;

  const mealTargets: MealNutritionTarget[] = daySnapshot.baseMeals.map((meal) => {
    const isPending = pending.has(meal.mealKey);
    const calories =
      isPending && energyAmounts
        ? nonNegative(energyAmounts.get(meal.mealKey) ?? meal.calories)
        : nonNegative(meal.calories);
    const proteinGrams =
      isPending && proteinAmounts
        ? nonNegative(proteinAmounts.get(meal.mealKey) ?? meal.proteinGrams)
        : nonNegative(meal.proteinGrams);
    const carbohydrateGrams =
      isPending && carbohydrateAmounts
        ? nonNegative(carbohydrateAmounts.get(meal.mealKey) ?? meal.carbohydrateGrams)
        : nonNegative(meal.carbohydrateGrams);
    const fatGrams =
      isPending && fatAmounts
        ? nonNegative(fatAmounts.get(meal.mealKey) ?? meal.fatGrams)
        : nonNegative(meal.fatGrams);
    return { ...meal, calories, proteinGrams, carbohydrateGrams, fatGrams };
  });

  return { mealTargets, unallocatedCalories, diagnostics };
}
