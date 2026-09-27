import {
  DIAGNOSTIC_UNSUPPORTED_PROFILE,
  ENERGY_CEILING_KCAL,
  INPUT_BOUNDS,
  KCAL_PER_GRAM,
  COHERENCE_EPSILON_KCAL,
  MACRO_PRESETS,
  POLICY_VERSION,
} from "./policy.ts";
import type {
  ActivityLevel,
  AllergyDisclosure,
  DietAssessment,
  DietGoal,
  DietPlan,
  EquationCoefficient,
  FoodTag,
  MealKey,
  MealNutritionTarget,
  PersonKey,
  ValidationResult,
  Diagnostic,
} from "../types.ts";

const PERSON_KEYS = new Set<PersonKey>(["felipe", "gabriela", "kelly"]);
const MEAL_KEYS = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
] as const satisfies readonly MealKey[];
const EQUATION_COEFFICIENTS = new Set<EquationCoefficient>(["male", "female"]);
const GOALS = new Set<DietGoal>(["maintain", "lose", "gain"]);
const ACTIVITIES = new Set<ActivityLevel>(["low", "light", "moderate", "high"]);

/** Tolerância para a soma das participações (1 = 100%). */
const SHARE_SUM_EPSILON = 1e-6;

/** Diferença aceita entre a participação e a fração de cada nutriente. */
const SHARE_MATCH_EPSILON = 1e-6;

export interface AssessmentIssue extends Diagnostic {
  field: string;
}

export interface HeightReview {
  /** Valor em centímetros, depois da conversão explícita, para conferência. */
  centimeters: number;
  sourceUnit: "cm" | "m";
}

export interface AssessmentValidationResult {
  valid: boolean;
  /**
   * Falso quando falta o coeficiente da equação ou o perfil não pode
   * receber uma proposta. O coeficiente não é inventado.
   */
  estimationCompleted: boolean;
  issues: readonly AssessmentIssue[];
  assessment: DietAssessment | null;
  heightReview: HeightReview | null;
}

/** Entrada do questionário. Números podem chegar como texto com vírgula decimal. */
export interface DietAssessmentInput {
  personKey?: unknown;
  ageYears?: unknown;
  height?: unknown;
  /** "cm" é o padrão. "m" converte para centímetros e guarda o valor para conferência. */
  heightUnit?: unknown;
  weightKg?: unknown;
  equationCoefficient?: unknown;
  goal?: unknown;
  activityLevel?: unknown;
  desiredWeightKg?: unknown;
  preferredFoodIds?: readonly string[];
  avoidedFoodIds?: readonly string[];
  avoidedGroups?: readonly FoodTag[];
  allergies?: AllergyDisclosure;
  freeTextNote?: string | null;
  pregnantOrLactating?: boolean | null;
  therapeuticDietRequired?: boolean | null;
  mealShares?: Readonly<Record<MealKey, number>> | null;
}

/**
 * Converte texto com vírgula decimal brasileira para número.
 * "80,5" e "1.800,5" são aceitos. Vazio, NaN e infinito não produzem número finito.
 */
export function parseBrazilianDecimal(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  let normalized = trimmed;
  if (normalized.includes(",")) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  }
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Converte altura para centímetros só quando a unidade é informada.
 * Metros são multiplicados por 100. O resultado é o valor a conferir.
 */
export function convertHeightToCentimeters(
  value: number,
  unit: "cm" | "m",
): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const centimeters = unit === "m" ? value * 100 : value;
  return Math.round(centimeters * 1000) / 1000;
}

type ParsedNumber =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "value"; value: number };

function parseRequiredNumber(raw: unknown): ParsedNumber {
  if (raw === null || raw === undefined) return { state: "empty" };
  if (typeof raw === "string") {
    if (raw.trim() === "") return { state: "empty" };
    const value = parseBrazilianDecimal(raw);
    return Number.isFinite(value) ? { state: "value", value } : { state: "invalid" };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { state: "value", value: raw } : { state: "invalid" };
  }
  return { state: "invalid" };
}

function issue(field: string, code: string, message: string): AssessmentIssue {
  return { field, code, message };
}

function readPositive(
  field: string,
  label: string,
  raw: unknown,
  issues: AssessmentIssue[],
): number | null {
  const parsed = parseRequiredNumber(raw);
  if (parsed.state === "empty") {
    issues.push(issue(field, "required", `${label} é obrigatório.`));
    return null;
  }
  if (parsed.state === "invalid") {
    issues.push(
      issue(field, "invalid_number", `${label} precisa ser um número finito.`),
    );
    return null;
  }
  if (parsed.value <= 0) {
    issues.push(
      issue(field, "non_positive", `${label} precisa ser maior que zero.`),
    );
    return null;
  }
  return parsed.value;
}

function readHeightUnit(raw: unknown, issues: AssessmentIssue[]): "cm" | "m" | null {
  if (raw === undefined || raw === null || raw === "" || raw === "cm") return "cm";
  if (raw === "m") return "m";
  issues.push(
    issue("heightUnit", "invalid_value", "A unidade de altura deve ser cm ou m."),
  );
  return null;
}

function readStringList(raw: readonly string[] | undefined): readonly string[] {
  if (!raw) return [];
  return [...raw];
}

function readAllergies(raw: AllergyDisclosure | undefined): AllergyDisclosure {
  if (!raw || raw.status === "none_reported") return { status: "none_reported" };
  return { status: "reported", items: [...raw.items] };
}

function explicitSharesValid(
  shares: Readonly<Record<MealKey, number>> | null | undefined,
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

export function validateAssessment(
  input: DietAssessmentInput,
): AssessmentValidationResult {
  const issues: AssessmentIssue[] = [];

  let personKey: PersonKey | null = null;
  if (typeof input.personKey !== "string" || input.personKey.trim() === "") {
    issues.push(issue("personKey", "required", "Perfil é obrigatório."));
  } else if (!PERSON_KEYS.has(input.personKey as PersonKey)) {
    issues.push(issue("personKey", "invalid_value", "Perfil desconhecido."));
  } else {
    personKey = input.personKey as PersonKey;
  }

  const ageYears = readPositive("ageYears", "Idade", input.ageYears, issues);
  if (ageYears !== null && !Number.isInteger(ageYears)) {
    issues.push(
      issue("ageYears", "invalid_number", "Idade deve ser em anos completos."),
    );
  } else if (ageYears !== null && !within(ageYears, INPUT_BOUNDS.ageYears)) {
    issues.push(
      issue(
        "ageYears",
        "out_of_bounds",
        `Idade fora da faixa de ${INPUT_BOUNDS.ageYears.min} a ${INPUT_BOUNDS.ageYears.max} anos.`,
      ),
    );
  }

  const heightUnit = readHeightUnit(input.heightUnit, issues);
  const heightInput = readPositive("height", "Altura", input.height, issues);
  let heightCm: number | null = null;
  let heightReview: HeightReview | null = null;
  if (heightUnit && heightInput !== null) {
    heightCm = convertHeightToCentimeters(heightInput, heightUnit);
    heightReview = { centimeters: heightCm, sourceUnit: heightUnit };
    if (!Number.isFinite(heightCm) || heightCm <= 0) {
      issues.push(
        issue("height", "non_positive", "Altura precisa ser maior que zero."),
      );
      heightCm = null;
    } else if (!within(heightCm, INPUT_BOUNDS.heightCm)) {
      issues.push(
        issue(
          "height",
          "out_of_bounds",
          `Altura fora da faixa de ${INPUT_BOUNDS.heightCm.min} a ${INPUT_BOUNDS.heightCm.max} cm.`,
        ),
      );
      heightCm = null;
    }
  }

  const weightKg = readPositive("weightKg", "Peso", input.weightKg, issues);
  if (weightKg !== null && !within(weightKg, INPUT_BOUNDS.weightKg)) {
    issues.push(
      issue(
        "weightKg",
        "out_of_bounds",
        `Peso fora da faixa de ${INPUT_BOUNDS.weightKg.min} a ${INPUT_BOUNDS.weightKg.max} kg.`,
      ),
    );
  }

  let equationCoefficient: EquationCoefficient | null = null;
  if (
    input.equationCoefficient === null ||
    input.equationCoefficient === undefined ||
    input.equationCoefficient === ""
  ) {
    issues.push(
      issue(
        "equationCoefficient",
        "missing_equation_coefficient",
        "A estimativa não foi concluída: informe o coeficiente masculino ou feminino da equação.",
      ),
    );
  } else if (
    typeof input.equationCoefficient !== "string" ||
    !EQUATION_COEFFICIENTS.has(input.equationCoefficient as EquationCoefficient)
  ) {
    issues.push(
      issue(
        "equationCoefficient",
        "missing_equation_coefficient",
        "A estimativa não foi concluída: o coeficiente da equação não foi informado.",
      ),
    );
  } else {
    equationCoefficient = input.equationCoefficient as EquationCoefficient;
  }

  let goal: DietGoal | null = null;
  if (input.goal === null || input.goal === undefined || input.goal === "") {
    issues.push(issue("goal", "required", "Objetivo é obrigatório."));
  } else if (typeof input.goal !== "string" || !GOALS.has(input.goal as DietGoal)) {
    issues.push(issue("goal", "invalid_value", "Objetivo inválido."));
  } else {
    goal = input.goal as DietGoal;
  }

  let activityLevel: ActivityLevel | null = null;
  if (
    input.activityLevel === null ||
    input.activityLevel === undefined ||
    input.activityLevel === ""
  ) {
    issues.push(issue("activityLevel", "required", "Nível de atividade é obrigatório."));
  } else if (
    typeof input.activityLevel !== "string" ||
    !ACTIVITIES.has(input.activityLevel as ActivityLevel)
  ) {
    issues.push(issue("activityLevel", "invalid_value", "Nível de atividade inválido."));
  } else {
    activityLevel = input.activityLevel as ActivityLevel;
  }

  let desiredWeightKg: number | null = null;
  if (input.desiredWeightKg !== undefined && input.desiredWeightKg !== null && input.desiredWeightKg !== "") {
    const desired = readPositive(
      "desiredWeightKg",
      "Peso desejado",
      input.desiredWeightKg,
      issues,
    );
    desiredWeightKg = desired;
  }

  let mealShares: Readonly<Record<MealKey, number>> | null = null;
  if (input.mealShares != null) {
    if (!explicitSharesValid(input.mealShares)) {
      issues.push(
        issue(
          "mealShares",
          "invalid_meal_shares",
          "As cinco refeições precisam permanecer e as participações somar 100%.",
        ),
      );
    } else {
      mealShares = {
        breakfast: input.mealShares.breakfast,
        lunch: input.mealShares.lunch,
        snack: input.mealShares.snack,
        dinner: input.mealShares.dinner,
        supper: input.mealShares.supper,
      };
    }
  }

  const pregnantOrLactating = input.pregnantOrLactating ?? null;
  const therapeuticDietRequired = input.therapeuticDietRequired ?? null;
  const unsupported =
    pregnantOrLactating === true || therapeuticDietRequired === true;
  if (unsupported) {
    issues.push(
      issue(
        "profile",
        DIAGNOSTIC_UNSUPPORTED_PROFILE,
        "Gestação, amamentação ou dieta terapêutica específica fica fora deste cálculo.",
      ),
    );
  }

  const desiredWeightInvalid = issues.some((item) => item.field === "desiredWeightKg");
  const assessment: DietAssessment | null =
    personKey !== null &&
    ageYears !== null &&
    Number.isInteger(ageYears) &&
    within(ageYears, INPUT_BOUNDS.ageYears) &&
    heightCm !== null &&
    weightKg !== null &&
    within(weightKg, INPUT_BOUNDS.weightKg) &&
    equationCoefficient !== null &&
    goal !== null &&
    activityLevel !== null &&
    !desiredWeightInvalid
      ? {
          personKey,
          ageYears,
          heightCm,
          weightKg,
          equationCoefficient,
          goal,
          activityLevel,
          desiredWeightKg,
          preferredFoodIds: readStringList(input.preferredFoodIds),
          avoidedFoodIds: readStringList(input.avoidedFoodIds),
          avoidedGroups: input.avoidedGroups ? [...input.avoidedGroups] : [],
          allergies: readAllergies(input.allergies),
          freeTextNote: input.freeTextNote ?? null,
          pregnantOrLactating,
          therapeuticDietRequired,
          mealShares,
        }
      : null;

  const blocking = issues.some((item) => item.code !== DIAGNOSTIC_UNSUPPORTED_PROFILE);
  const valid = assessment !== null && !unsupported && !blocking;
  const estimationCompleted = valid;

  return {
    valid,
    estimationCompleted,
    issues,
    assessment,
    heightReview,
  };
}

function within(value: number, bounds: { min: number; max: number }): boolean {
  return value >= bounds.min && value <= bounds.max;
}

function macroEnergy(plan: DietPlan): number {
  return (
    KCAL_PER_GRAM.protein * plan.daily.proteinGrams +
    KCAL_PER_GRAM.carbohydrate * plan.daily.carbohydrateGrams +
    KCAL_PER_GRAM.fat * plan.daily.fatGrams
  );
}

function mealMacroEnergy(meal: MealNutritionTarget): number {
  return (
    KCAL_PER_GRAM.protein * meal.proteinGrams +
    KCAL_PER_GRAM.carbohydrate * meal.carbohydrateGrams +
    KCAL_PER_GRAM.fat * meal.fatGrams
  );
}

/**
 * Confere coerência interna do plano: macros, cinco refeições e soma de 100%.
 * Não altera o plano nem o armazenamento.
 */
export function validateDietPlan(plan: DietPlan): ValidationResult {
  const issues: Diagnostic[] = [];

  if (plan.policyId !== POLICY_VERSION) {
    issues.push({
      code: "policy",
      message: "A versão da política do plano não é reconhecida.",
    });
  }

  const daily = plan.daily;
  const dailyFinite =
    Number.isFinite(daily.calories) &&
    Number.isFinite(daily.proteinGrams) &&
    Number.isFinite(daily.carbohydrateGrams) &&
    Number.isFinite(daily.fatGrams);
  if (!dailyFinite || daily.calories <= 0 || daily.calories > ENERGY_CEILING_KCAL) {
    issues.push({
      code: "invalid_target",
      message: "A meta diária de calorias não é utilizável.",
    });
  }
  if (
    !dailyFinite ||
    daily.proteinGrams < 0 ||
    daily.carbohydrateGrams < 0 ||
    daily.fatGrams < 0
  ) {
    issues.push({
      code: "invalid_target",
      message: "Os macronutrientes diários não são utilizáveis.",
    });
  }

  if (dailyFinite && daily.calories > 0) {
    const gap = Math.abs(daily.calories - macroEnergy(plan));
    if (gap > COHERENCE_EPSILON_KCAL) {
      issues.push({
        code: "incoherent_energy",
        message: "Calorias e macronutrientes não fecham no valor interno.",
      });
    }
    const preset = MACRO_PRESETS[plan.assessment.goal];
    const expectedProtein =
      (daily.calories * preset.protein) / 100 / KCAL_PER_GRAM.protein;
    const expectedCarbohydrate =
      (daily.calories * preset.carbohydrate) / 100 / KCAL_PER_GRAM.carbohydrate;
    const expectedFat = (daily.calories * preset.fat) / 100 / KCAL_PER_GRAM.fat;
    if (
      Math.abs(daily.proteinGrams - expectedProtein) > SHARE_MATCH_EPSILON ||
      Math.abs(daily.carbohydrateGrams - expectedCarbohydrate) > SHARE_MATCH_EPSILON ||
      Math.abs(daily.fatGrams - expectedFat) > SHARE_MATCH_EPSILON
    ) {
      issues.push({
        code: "macro_preset",
        message: "Os macros não seguem o preset do objetivo.",
      });
    }
  }

  const seen = new Set<MealKey>();
  let shareSum = 0;
  let calorieSum = 0;
  let proteinSum = 0;
  let carbohydrateSum = 0;
  let fatSum = 0;
  if (plan.meals.length !== MEAL_KEYS.length) {
    issues.push({
      code: "meal_count",
      message: "O plano precisa manter as cinco refeições.",
    });
  }
  for (const meal of plan.meals) {
    if (seen.has(meal.mealKey) || !MEAL_KEYS.includes(meal.mealKey)) {
      issues.push({
        code: "meal_count",
        message: "Há refeição repetida ou fora das cinco existentes.",
      });
    }
    seen.add(meal.mealKey);
    if (!Number.isFinite(meal.share) || meal.share <= 0) {
      issues.push({
        code: "meal_share",
        message: `Participação inválida em ${meal.mealKey}.`,
      });
      continue;
    }
    shareSum += meal.share;
    calorieSum += meal.calories;
    proteinSum += meal.proteinGrams;
    carbohydrateSum += meal.carbohydrateGrams;
    fatSum += meal.fatGrams;
    if (dailyFinite && daily.calories > 0 && daily.proteinGrams > 0) {
      const calorieShare = meal.calories / daily.calories;
      const sameWeight =
        Math.abs(meal.share - calorieShare) <= SHARE_MATCH_EPSILON &&
        Math.abs(meal.proteinGrams / daily.proteinGrams - calorieShare) <=
          SHARE_MATCH_EPSILON &&
        Math.abs(meal.carbohydrateGrams / daily.carbohydrateGrams - calorieShare) <=
          SHARE_MATCH_EPSILON &&
        Math.abs(meal.fatGrams / daily.fatGrams - calorieShare) <= SHARE_MATCH_EPSILON;
      if (!sameWeight) {
        issues.push({
          code: "meal_share",
          message: `A refeição ${meal.mealKey} não usa o mesmo peso em todos os macros.`,
        });
      }
    }
    if (Math.abs(meal.calories - mealMacroEnergy(meal)) > COHERENCE_EPSILON_KCAL) {
      issues.push({
        code: "incoherent_energy",
        message: `A refeição ${meal.mealKey} não fecha calorias e macros.`,
      });
    }
  }
  for (const key of MEAL_KEYS) {
    if (!seen.has(key)) {
      issues.push({
        code: "meal_count",
        message: `Falta a refeição ${key}.`,
      });
    }
  }
  if (plan.meals.length > 0 && Math.abs(shareSum - 1) > SHARE_SUM_EPSILON) {
    issues.push({
      code: "meal_share",
      message: "As participações das refeições não somam 100%.",
    });
  }
  if (dailyFinite && plan.meals.length > 0) {
    if (
      Math.abs(calorieSum - daily.calories) > SHARE_MATCH_EPSILON ||
      Math.abs(proteinSum - daily.proteinGrams) > SHARE_MATCH_EPSILON ||
      Math.abs(carbohydrateSum - daily.carbohydrateGrams) > SHARE_MATCH_EPSILON ||
      Math.abs(fatSum - daily.fatGrams) > SHARE_MATCH_EPSILON
    ) {
      issues.push({
        code: "meal_total",
        message: "A soma das refeições não recupera a meta diária.",
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
