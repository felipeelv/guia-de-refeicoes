export type MealKey =
  | "breakfast"
  | "lunch"
  | "snack"
  | "dinner"
  | "supper";

export interface MealConfig {
  key: MealKey;
  label: string;
  targetCalories: number;
  carbohydrateShare: number;
  proteinShare: number;
  order: number;
}

export type PersonKey = "felipe" | "gabriela" | "kelly";

export type FoodTag = "fruit";

export interface Person {
  key: PersonKey;
  name: string;
  dailyCalories: number;
  roundingIncrementGrams: number;
  excludedTags: FoodTag[];
  meals: MealConfig[];
}

export type FoodCategory = "carbohydrate" | "protein";

export type CarbohydrateBasis =
  | "available"
  | "total_including_fiber"
  | "unspecified";

/**
 * present: a restrição está no alimento.
 * verified_absent: a fonte declara ausência.
 * unknown: não há confirmação. Não é compatível e não é ausência.
 */
export type RestrictionKnowledge = "present" | "verified_absent" | "unknown";

/** Restrições que o catálogo sabe consultar. Não cobre contaminação cruzada. */
export const SUPPORTED_RESTRICTIONS = [
  "gluten",
  "milk",
  "lactose",
  "egg",
  "fish",
  "tree_nut",
] as const;

export type SupportedRestriction = (typeof SUPPORTED_RESTRICTIONS)[number];

/**
 * Limites da busca do protótipo, por alimento.
 * Não são porção recomendada nem máximo clínico.
 * step null usa o incremento de gramas do perfil.
 * Em alimento com unidade, minimum, maximum e step são em unidades.
 */
export interface FoodPortionBounds {
  minimum: number;
  maximum: number;
  step: number | null;
}

export interface FoodUnit {
  singular: string;
  plural: string;
  gramsPerUnit: number;
  stepUnits: number;
}

export interface FoodSource {
  name: "TBCA" | string;
  code: string;
  url?: string;
  accessedAt: string;
}

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  meals: MealKey[];
  tags?: FoodTag[];
  preparation: string;
  unit?: FoodUnit;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbohydratePer100g: number | null;
  fatPer100g: number | null;
  /**
   * Base do número já gravado em carbohydratePer100g.
   * Não presume que o campo antigo seja carboidrato disponível.
   * Ausente equivale a unspecified.
   */
  carbohydrateBasis?: CarbohydrateBasis;
  /** Da mesma ficha, quando a fonte informa número finito. Não substitui o campo antigo. */
  availableCarbohydratePer100g?: number | null;
  totalCarbohydratePer100g?: number | null;
  /** Null quando a fibra não foi analisada. Não equivale a zero. */
  fiberPer100g?: number | null;
  portionBounds?: FoodPortionBounds;
  /**
   * Conhecimento por restrição suportada.
   * Chave ausente é desconhecido, não ausência verificada.
   */
  restrictions?: Partial<Record<SupportedRestriction, RestrictionKnowledge>>;
  source: FoodSource;
  active: boolean;
  sortOrder: number;
}

export interface PortionCalculationInput {
  meal: MealConfig;
  carbohydrateFood: Food;
  secondCarbohydrateFood?: Food | null;
  proteinFood: Food;
  /** Só entra no cálculo calórico do café da manhã e do almoço. */
  secondProteinFood?: Food | null;
  roundingIncrementGrams?: number;
  tolerancePercent?: number;
}

export interface PortionResultItem {
  foodId: string;
  name: string;
  grams: number;
  units: number | null;
  unit: FoodUnit | null;
  calories: number;
}

export type ToleranceStatus = "within" | "below" | "above";

export interface PortionCalculationResult {
  mealKey: MealKey;
  targetCalories: number;
  carbohydrate: PortionResultItem;
  secondCarbohydrate: PortionResultItem | null;
  protein: PortionResultItem;
  secondProtein: PortionResultItem | null;
  totalCalories: number;
  differenceCalories: number;
  differencePercent: number;
  toleranceStatus: ToleranceStatus;
}

// Contratos da dieta personalizada. O cálculo calórico existente permanece
// em PortionCalculationInput / PortionCalculationResult.

export type CalculationPolicyId = "experimental-v1";

export type EquationCoefficient = "male" | "female";

export type DietGoal = "maintain" | "lose" | "gain";

export type ActivityLevel = "low" | "light" | "moderate" | "high";

export type DietDiagnosticCode =
  | "energy_floor_applied"
  | "goal_conflict"
  | "unsupported_energy_range"
  | "unsupported_profile";

export interface Diagnostic<Code extends string = string> {
  code: Code;
  message: string;
}

export type AllergyDisclosure =
  | { status: "none_reported" }
  | { status: "reported"; items: readonly string[] };

/** Respostas informadas no questionário. Nada aqui é inferido do nome do perfil. */
export interface DietAssessment {
  personKey: PersonKey;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  equationCoefficient: EquationCoefficient;
  goal: DietGoal;
  activityLevel: ActivityLevel;
  desiredWeightKg: number | null;
  preferredFoodIds: readonly string[];
  avoidedFoodIds: readonly string[];
  avoidedGroups: readonly FoodTag[];
  allergies: AllergyDisclosure;
  /** Texto livre. Não cria restrição executável. */
  freeTextNote: string | null;
  pregnantOrLactating: boolean | null;
  therapeuticDietRequired: boolean | null;
  /**
   * Participação de cada refeição, somando 1.
   * Null usa os pesos do perfil ou o fallback da política.
   */
  mealShares: Readonly<Record<MealKey, number>> | null;
}

export interface NutritionTargets {
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
}

export interface MealNutritionTarget extends NutritionTargets {
  mealKey: MealKey;
  share: number;
}

/** Plano confirmado. Não é reescrito depois da confirmação. */
export interface DietPlan {
  id: string;
  personKey: PersonKey;
  policyId: CalculationPolicyId;
  assessment: DietAssessment;
  catalogVersion: string;
  createdAt: string;
  daily: NutritionTargets;
  meals: readonly MealNutritionTarget[];
}

export type PlanActivationStatus =
  | "scheduled"
  | "active"
  | "cancelled"
  | "superseded";

/** Uma vigência efetiva por perfil e dia. Restaurar cria outra ativação. */
export interface PlanActivation {
  id: string;
  personKey: PersonKey;
  planId: string;
  /** YYYY-MM-DD no calendário America/Sao_Paulo. */
  effectiveDate: string;
  status: PlanActivationStatus;
  createdAt: string;
}

/** null continua desconhecido e não equivale a zero. */
export interface FoodNutritionV2 {
  foodId: string;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbohydratePer100g: number | null;
  fatPer100g: number | null;
  carbohydrateBasis: CarbohydrateBasis;
  preparation: string;
  source: FoodSource;
  version: string;
}

export interface PortionConstraints {
  foodId: string;
  minimum: number;
  maximum: number;
  step: number;
  unit: FoodUnit | null;
}

export type MealSelectionSlot =
  | "carbohydrate"
  | "carbohydrate2"
  | "protein"
  | "protein2";

/**
 * Seleção de uma refeição. protein2 é só o contrato da segunda proteína;
 * café e almoço poderão usá-la. As demais refeições seguem com uma proteína.
 */
export interface MealSelection {
  mealKey: MealKey;
  carbohydrateId: string;
  carbohydrate2Id: string | null;
  proteinId: string;
  protein2Id: string | null;
}

export const PORTION_SOLUTION_STATES = [
  "within_targets",
  "approximate",
  "search_incomplete",
  "missing_nutrition",
  "invalid_selection",
  "no_valid_portions",
  "energy_budget_exhausted",
] as const;

export type PortionSolutionState = (typeof PORTION_SOLUTION_STATES)[number];

export interface PortionSolutionItem {
  foodId: string;
  role: MealSelectionSlot;
  grams: number;
  units: number | null;
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
}

/** Resultado de solveMealPortions. */
export interface PortionSolution {
  mealKey: MealKey;
  state: PortionSolutionState;
  portions: readonly PortionSolutionItem[];
  totals: NutritionTargets;
  targets: NutritionTargets;
  /** total − meta, com sinal. */
  deviations: NutritionTargets;
  diagnostics: readonly Diagnostic[];
}

export interface SolveMealPortionsInput {
  selection: MealSelection;
  targets: NutritionTargets;
  foods: readonly FoodNutritionV2[];
  constraints: readonly PortionConstraints[];
  policyId: CalculationPolicyId;
}

/** Cópia do plano vigente, congelada no primeiro consumo do dia. */
export interface DayPlanSnapshot {
  personKey: PersonKey;
  date: string;
  plan: DietPlan;
  baseDaily: NutritionTargets;
  baseMeals: readonly MealNutritionTarget[];
  frozenAt: string | null;
}

export interface FrozenNutrients {
  calories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
}

/** Lançamento com nutrientes copiados no momento do registro. */
export interface LogEntryV2 {
  id: string;
  batchId: string;
  personKey: PersonKey;
  date: string;
  mealKey: MealKey;
  foodId: string;
  foodName: string;
  preparation: string;
  grams: number;
  units: number | null;
  nutrients: FrozenNutrients;
  source: FoodSource;
  foodVersion: string;
  dayPlanId: string | null;
  createdAt: string;
}

export type NutrientCoverage = "complete" | "partial";

export interface SignedBalances {
  calories: number;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
}

/** Resultado de summarizeDay. Saldos negativos representam excesso. */
export interface DayNutritionSummary {
  personKey: PersonKey;
  date: string;
  consumed: NutritionTargets;
  balances: SignedBalances;
  coverage: NutrientCoverage;
  pendingMealKeys: readonly MealKey[];
  /** False enquanto o perfil estiver em legacy_calories_only. */
  macroTargetsConfigured: boolean;
}

export const PROFILE_STORE_V2_KEY_PREFIX = "meal-guide:v2:profile:";

export interface ProfileDayState {
  date: string;
  snapshot: DayPlanSnapshot | null;
  entries: readonly LogEntryV2[];
}

/** Envelope meal-guide:v2:profile:<personKey>. Uma escrita é um estado completo. */
export interface ProfileStoreV2 {
  schemaVersion: 2;
  personKey: PersonKey;
  revision: number;
  draftAssessment: DietAssessment | null;
  confirmedAssessment: DietAssessment | null;
  plans: readonly DietPlan[];
  activations: readonly PlanActivation[];
  days: readonly ProfileDayState[];
}

/** Resultado de estimateEnergy. GER e TDEE permanecem sem arredondamento. */
export interface EnergyEstimateResult {
  policyId: CalculationPolicyId;
  restingCalories: number;
  dailyExpenditureCalories: number;
  rawTargetCalories: number;
  /**
   * Meta após piso e arredondamento ao passo da política.
   * Null quando a proposta não deve ser aplicada.
   */
  targetCalories: number | null;
  diagnostics: readonly Diagnostic<DietDiagnosticCode>[];
}

/** Resultado de createDietProposal. */
export interface DietProposalResult {
  policyId: CalculationPolicyId;
  estimate: EnergyEstimateResult;
  daily: NutritionTargets | null;
  meals: readonly MealNutritionTarget[];
  diagnostics: readonly Diagnostic<DietDiagnosticCode>[];
}

/** Resultado de validateDietPlan. */
export interface ValidationResult {
  valid: boolean;
  issues: readonly Diagnostic[];
}

/** Resultado de rebalanceRemainingMeals. Não altera a meta-base do dia. */
export interface RebalanceResult {
  mealTargets: readonly MealNutritionTarget[];
  unallocatedCalories: number;
  diagnostics: readonly Diagnostic[];
}

/** Resultado de migrateProfileV1. A fonte anterior permanece disponível. */
export interface MigrationResult {
  ok: boolean;
  profile: ProfileStoreV2 | null;
  legacyPreserved: boolean;
  diagnostics: readonly Diagnostic[];
}
