import { experimentalV1Policy, roundEnergyTargetKcal } from "./policy.ts";
import type {
  DietAssessment,
  DietDiagnosticCode,
  DietGoal,
  Diagnostic,
  EnergyEstimateResult,
} from "../types.ts";

export type NutritionPolicy = typeof experimentalV1Policy;

const MESSAGES: Record<DietDiagnosticCode, string> = {
  energy_floor_applied:
    "A meta ficou abaixo do piso e foi ajustada. Os macros usam a meta ajustada.",
  goal_conflict:
    "O ajuste inverteria o sentido do objetivo em relação ao gasto estimado e não foi aplicado.",
  unsupported_energy_range:
    "A meta fica acima do teto operacional e não foi cortada.",
  unsupported_profile:
    "Gestação, amamentação ou dieta terapêutica específica fica fora deste cálculo.",
};

function diagnostic(code: DietDiagnosticCode): Diagnostic<DietDiagnosticCode> {
  return { code, message: MESSAGES[code] };
}

/**
 * O objetivo de perder pede meta abaixo do gasto; ganhar pede meta acima.
 * Manter não tem sentido a inverter: o arredondamento ao passo pode afastar
 * alguns kcal sem caracterizar conflito.
 */
function invertsGoal(goal: DietGoal, tdee: number, candidate: number): boolean {
  if (goal === "lose") return candidate > tdee;
  if (goal === "gain") return candidate < tdee;
  return false;
}

/**
 * Mifflin–St Jeor com os coeficientes da política.
 * GER e gasto diário permanecem sem arredondamento. A meta final usa o passo
 * da política, com desempate para cima. Não altera metas legadas dos perfis.
 */
export function estimateEnergy(
  assessment: DietAssessment,
  policy: NutritionPolicy,
): EnergyEstimateResult {
  const equation = policy.mifflinStJeor;
  const intercept =
    assessment.equationCoefficient === "male"
      ? equation.maleIntercept
      : equation.femaleIntercept;
  const restingCalories =
    equation.weightPerKg * assessment.weightKg +
    equation.heightPerCm * assessment.heightCm +
    equation.agePerYear * assessment.ageYears +
    intercept;
  const dailyExpenditureCalories =
    restingCalories * policy.activityFactors[assessment.activityLevel];
  const rawTargetCalories =
    dailyExpenditureCalories * policy.goalMultipliers[assessment.goal];

  const base = {
    policyId: policy.id,
    restingCalories,
    dailyExpenditureCalories,
    rawTargetCalories,
  };

  if (
    assessment.pregnantOrLactating === true ||
    assessment.therapeuticDietRequired === true
  ) {
    return {
      ...base,
      targetCalories: null,
      diagnostics: [diagnostic(policy.diagnostics.unsupportedProfile)],
    };
  }

  if (!(rawTargetCalories <= policy.energyCeilingKcal)) {
    return {
      ...base,
      targetCalories: null,
      diagnostics: [diagnostic(policy.diagnostics.unsupportedEnergyRange)],
    };
  }

  const rounded = roundEnergyTargetKcal(rawTargetCalories);
  const floor = policy.energyFloorKcal[assessment.equationCoefficient];

  if (rounded < floor) {
    if (invertsGoal(assessment.goal, dailyExpenditureCalories, floor)) {
      return {
        ...base,
        targetCalories: null,
        diagnostics: [diagnostic(policy.diagnostics.goalConflict)],
      };
    }
    return {
      ...base,
      targetCalories: floor,
      diagnostics: [diagnostic(policy.diagnostics.energyFloorApplied)],
    };
  }

  if (invertsGoal(assessment.goal, dailyExpenditureCalories, rounded)) {
    return {
      ...base,
      targetCalories: null,
      diagnostics: [diagnostic(policy.diagnostics.goalConflict)],
    };
  }

  return {
    ...base,
    targetCalories: rounded,
    diagnostics: [],
  };
}
