import type {
  ActivityLevel,
  DietGoal,
  EquationCoefficient,
  MealKey,
} from "../types.ts";

/** Política vigente. Planos confirmados guardam este identificador. */
export const POLICY_VERSION = "experimental-v1" as const;

/**
 * Mifflin–St Jeor simplificado, sem arredondamento do GER.
 * GER = weightPerKg × kg + heightPerCm × cm + agePerYear × idade + intercepto.
 * agePerYear já é −5. O intercepto masculino é +5 e o feminino é −161.
 */
export const MIFFLIN_ST_JEOR = {
  weightPerKg: 10,
  heightPerCm: 6.25,
  agePerYear: -5,
  maleIntercept: 5,
  femaleIntercept: -161,
} as const;

/** baixa, leve, moderada e alta. Não somar calorias de treino por cima do fator. */
export const ACTIVITY_FACTORS = {
  low: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
} as const satisfies Record<ActivityLevel, number>;

/** manter, perder e ganhar. Aplicados sobre o gasto diário ainda não arredondado. */
export const GOAL_MULTIPLIERS = {
  maintain: 1,
  lose: 0.85,
  gain: 1.1,
} as const satisfies Record<DietGoal, number>;

/** Só a meta final usa este passo. GER e TDEE ficam com as casas decimais. */
export const ENERGY_TARGET_STEP_KCAL = 10;

/**
 * Múltiplo de 10 kcal mais próximo. Empate (meia unidade do passo) arredonda
 * para cima. Não usar em GER nem no gasto diário.
 */
export function roundEnergyTargetKcal(rawTargetKcal: number): number {
  const scaled = rawTargetKcal / ENERGY_TARGET_STEP_KCAL;
  const lower = Math.floor(scaled);
  const fraction = scaled - lower;
  const units = fraction >= 0.5 ? lower + 1 : lower;
  return units * ENERGY_TARGET_STEP_KCAL;
}

/**
 * Pisos de novas estimativas, por coeficiente da equação.
 * Se o piso entrar, registrar energy_floor_applied e recalcular os macros
 * com a meta ajustada.
 */
export const ENERGY_FLOOR_KCAL = {
  female: 1200,
  male: 1500,
} as const satisfies Record<EquationCoefficient, number>;

/**
 * Teto operacional. Acima dele o resultado é unsupported_energy_range.
 * Não cortar a meta em silêncio para caber no teto.
 */
export const ENERGY_CEILING_KCAL = 5000;

/** Piso aplicado. A meta bruta continua visível; os macros usam a meta ajustada. */
export const DIAGNOSTIC_ENERGY_FLOOR_APPLIED = "energy_floor_applied" as const;

/**
 * O multiplicador do objetivo inverteria o sentido em relação ao gasto estimado.
 * Não aplicar sozinho: devolver para revisão.
 */
export const DIAGNOSTIC_GOAL_CONFLICT = "goal_conflict" as const;

/** Meta acima do teto. A estimativa não é aceita e não é cortada. */
export const DIAGNOSTIC_UNSUPPORTED_ENERGY_RANGE =
  "unsupported_energy_range" as const;

/**
 * Respostas fora do cálculo geral, como gestação, amamentação ou dieta
 * terapêutica. Não apaga o diário nem o plano já existente.
 */
export const DIAGNOSTIC_UNSUPPORTED_PROFILE = "unsupported_profile" as const;

/** Carboidrato, proteína e gordura em percentual. Cada preset soma 100. */
export const MACRO_PRESETS = {
  maintain: { carbohydrate: 50, protein: 20, fat: 30 },
  lose: { carbohydrate: 45, protein: 25, fat: 30 },
  gain: { carbohydrate: 50, protein: 25, fat: 25 },
} as const satisfies Record<
  DietGoal,
  { carbohydrate: number; protein: number; fat: number }
>;

/** Fatores energéticos para montar metas coerentes, não para reescrever o alimento. */
export const KCAL_PER_GRAM = {
  carbohydrate: 4,
  protein: 4,
  fat: 9,
} as const;

/** |kcal − (4p + 4c + 9g)| não pode passar disto nos valores internos. */
export const COHERENCE_EPSILON_KCAL = 0.01;

/** Limites de suporte do protótipo, não fronteiras clínicas. */
export const INPUT_BOUNDS = {
  ageYears: { min: 18, max: 80 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 35, max: 250 },
} as const;

/** Café, almoço, lanche, jantar e ceia quando o perfil não tem pesos válidos. */
export const FALLBACK_MEAL_SHARES = {
  breakfast: 0.2,
  lunch: 0.275,
  snack: 0.15,
  dinner: 0.275,
  supper: 0.1,
} as const satisfies Record<MealKey, number>;

/**
 * Tolerância absoluta e fração do alvo da refeição.
 * O limite usado é o maior dos dois. Energia em kcal; macros em gramas.
 */
export const PORTION_TOLERANCES = {
  energy: { absolute: 20, relative: 0.05 },
  protein: { absolute: 3, relative: 0.1 },
  carbohydrate: { absolute: 5, relative: 0.1 },
  fat: { absolute: 2, relative: 0.15 },
} as const;

export function portionTolerance(
  metric: keyof typeof PORTION_TOLERANCES,
  target: number,
): number {
  const spec = PORTION_TOLERANCES[metric];
  return Math.max(spec.absolute, spec.relative * target);
}

/**
 * Pesos do custo normalizado. Cada peso multiplica o quadrado do erro
 * daquela métrica: 2 × erroEnergia² + erroProteína² + erroCarboidrato² + erroGordura².
 */
export const SOLVER_COST_WEIGHTS = {
  energy: 2,
  protein: 1,
  carbohydrate: 1,
  fat: 1,
} as const;

export function solverCost(normalizedError: {
  energy: number;
  protein: number;
  carbohydrate: number;
  fat: number;
}): number {
  const weights = SOLVER_COST_WEIGHTS;
  return (
    weights.energy * normalizedError.energy ** 2 +
    weights.protein * normalizedError.protein ** 2 +
    weights.carbohydrate * normalizedError.carbohydrate ** 2 +
    weights.fat * normalizedError.fat ** 2
  );
}

export const experimentalV1Policy = {
  id: POLICY_VERSION,
  mifflinStJeor: MIFFLIN_ST_JEOR,
  activityFactors: ACTIVITY_FACTORS,
  goalMultipliers: GOAL_MULTIPLIERS,
  energyTargetStepKcal: ENERGY_TARGET_STEP_KCAL,
  energyFloorKcal: ENERGY_FLOOR_KCAL,
  energyCeilingKcal: ENERGY_CEILING_KCAL,
  diagnostics: {
    energyFloorApplied: DIAGNOSTIC_ENERGY_FLOOR_APPLIED,
    goalConflict: DIAGNOSTIC_GOAL_CONFLICT,
    unsupportedEnergyRange: DIAGNOSTIC_UNSUPPORTED_ENERGY_RANGE,
    unsupportedProfile: DIAGNOSTIC_UNSUPPORTED_PROFILE,
  },
  macroPresetsPercent: MACRO_PRESETS,
  kcalPerGram: KCAL_PER_GRAM,
  coherenceEpsilonKcal: COHERENCE_EPSILON_KCAL,
  inputBounds: INPUT_BOUNDS,
  fallbackMealShares: FALLBACK_MEAL_SHARES,
  portionTolerances: PORTION_TOLERANCES,
  solverCostWeights: SOLVER_COST_WEIGHTS,
} as const;
