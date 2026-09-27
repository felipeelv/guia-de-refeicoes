import type {
  DayNutritionSummary,
  FrozenNutrients,
  LogEntryV2,
  MealKey,
  NutrientCoverage,
  NutritionTargets,
  PersonKey,
} from "../types.ts";

/** Texto para perfis sem questionário. Não há meta de macros a exibir. */
export const MACRO_TARGETS_NOT_CONFIGURED = "Meta de macros ainda não configurada";

export interface SummarizeDayInput {
  personKey: PersonKey;
  date: string;
  entries: readonly LogEntryV2[];
  baseDaily: NutritionTargets;
  mealKeys: readonly MealKey[];
  /** False em legacy_calories_only. Não transforma os zeros do plano legado em meta. */
  macroTargetsConfigured: boolean;
}

interface NutrientSum {
  total: number;
  complete: boolean;
}

function sumNutrient(
  entries: readonly LogEntryV2[],
  pick: (nutrients: FrozenNutrients) => number | null,
): NutrientSum {
  let total = 0;
  let complete = true;
  for (const entry of entries) {
    const value = pick(entry.nutrients);
    if (value == null || !Number.isFinite(value)) {
      complete = false;
      continue;
    }
    total += value;
  }
  return { total, complete };
}

export function macroTargetMessage(
  summary: Pick<DayNutritionSummary, "macroTargetsConfigured">,
): string | null {
  return summary.macroTargetsConfigured ? null : MACRO_TARGETS_NOT_CONFIGURED;
}

/**
 * Subtotal conhecido em `consumed`. Cobertura parcial não trata lacuna como zero.
 * Saldo de macro só existe quando a meta está configurada e aquele macro está completo.
 */
export function summarizeDay(input: SummarizeDayInput): DayNutritionSummary {
  const calories = sumNutrient(input.entries, (nutrients) => nutrients.calories);
  const protein = sumNutrient(input.entries, (nutrients) => nutrients.proteinGrams);
  const carbohydrate = sumNutrient(input.entries, (nutrients) => nutrients.carbohydrateGrams);
  const fat = sumNutrient(input.entries, (nutrients) => nutrients.fatGrams);
  const coverage: NutrientCoverage =
    protein.complete && carbohydrate.complete && fat.complete ? "complete" : "partial";
  const eaten = new Set(input.entries.map((entry) => entry.mealKey));
  const pendingMealKeys = input.mealKeys.filter((mealKey) => !eaten.has(mealKey));
  const macroBalance = (sum: NutrientSum, target: number): number | null => {
    if (!input.macroTargetsConfigured || !sum.complete) return null;
    return target - sum.total;
  };

  return {
    personKey: input.personKey,
    date: input.date,
    consumed: {
      calories: calories.total,
      proteinGrams: protein.total,
      carbohydrateGrams: carbohydrate.total,
      fatGrams: fat.total,
    },
    balances: {
      calories: calories.complete ? input.baseDaily.calories - calories.total : Number.NaN,
      proteinGrams: macroBalance(protein, input.baseDaily.proteinGrams),
      carbohydrateGrams: macroBalance(carbohydrate, input.baseDaily.carbohydrateGrams),
      fatGrams: macroBalance(fat, input.baseDaily.fatGrams),
    },
    coverage,
    pendingMealKeys,
    macroTargetsConfigured: input.macroTargetsConfigured,
  };
}
