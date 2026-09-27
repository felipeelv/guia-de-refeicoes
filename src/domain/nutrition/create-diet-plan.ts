import { distributeTargets, resolveMealShares } from "./distribute-targets.ts";
import { estimateEnergy, type NutritionPolicy } from "./estimate-energy.ts";
import type {
  DietAssessment,
  DietProposalResult,
  NutritionTargets,
} from "../types.ts";
import type { MealCalorieWeight } from "./distribute-targets.ts";

function macroTargets(
  calories: number,
  goal: DietAssessment["goal"],
  policy: NutritionPolicy,
): NutritionTargets {
  const preset = policy.macroPresetsPercent[goal];
  const percentSum = preset.carbohydrate + preset.protein + preset.fat;
  if (percentSum !== 100) {
    throw new Error("Os percentuais de macros da política não somam 100%.");
  }
  const proteinGrams =
    (calories * preset.protein) / 100 / policy.kcalPerGram.protein;
  const carbohydrateGrams =
    (calories * preset.carbohydrate) / 100 / policy.kcalPerGram.carbohydrate;
  const fatGrams = (calories * preset.fat) / 100 / policy.kcalPerGram.fat;
  const reconstructed =
    policy.kcalPerGram.protein * proteinGrams +
    policy.kcalPerGram.carbohydrate * carbohydrateGrams +
    policy.kcalPerGram.fat * fatGrams;
  if (Math.abs(calories - reconstructed) > policy.coherenceEpsilonKcal) {
    throw new Error("As metas de macros não fecham com as calorias.");
  }
  return {
    calories,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
  };
}

/**
 * Proposta nova a partir da avaliação. Não grava plano, não lê rede e não
 * mexe nas metas calóricas legadas dos perfis.
 */
export function createDietProposal(
  assessment: DietAssessment,
  policy: NutritionPolicy,
  baseMeals: readonly MealCalorieWeight[],
): DietProposalResult {
  const estimate = estimateEnergy(assessment, policy);
  if (estimate.targetCalories === null) {
    return {
      policyId: policy.id,
      estimate,
      daily: null,
      meals: [],
      diagnostics: estimate.diagnostics,
    };
  }

  const daily = macroTargets(estimate.targetCalories, assessment.goal, policy);
  const shares = resolveMealShares(
    baseMeals,
    assessment.mealShares,
    policy.fallbackMealShares,
  );
  return {
    policyId: policy.id,
    estimate,
    daily,
    meals: distributeTargets(daily, shares),
    diagnostics: estimate.diagnostics,
  };
}
