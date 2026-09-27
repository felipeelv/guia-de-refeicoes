import type {
  CarbohydrateBasis,
  Food,
  FoodCategory,
  FoodPortionBounds,
  FoodTag,
  MealKey,
  PortionConstraints,
  RestrictionKnowledge,
  SupportedRestriction,
} from "../domain/types.ts";
import { KCAL_PER_GRAM } from "../domain/nutrition/policy.ts";
import rawFoods from "./foods.json" with { type: "json" };

const RAW_WORD = /\bcru(?:a|o|as|os)?\b/i;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = new Set<FoodCategory>(["carbohydrate", "protein"]);
const MEAL_KEYS = new Set<MealKey>([
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
]);
const TAGS = new Set<FoodTag>(["fruit"]);
const CARBOHYDRATE_BASES = new Set<CarbohydrateBasis>([
  "available",
  "total_including_fiber",
  "unspecified",
]);
const RESTRICTION_KNOWLEDGE = new Set<RestrictionKnowledge>([
  "present",
  "verified_absent",
  "unknown",
]);
/** Discrepância maior que 10% é triagem. Não corrige a energia da ficha. */
const ENERGY_REVIEW_RATIO = 0.1;
const SNAP_EPSILON = 1e-9;

export function catalogIssue(food: Food): string | null {
  if (!ID_PATTERN.test(food.id)) return `Id inválido: ${food.id}.`;
  if (!food.name.trim()) return `Nome ausente em ${food.id}.`;
  if (!food.preparation.trim()) return `Preparo ausente em ${food.id}.`;
  if (RAW_WORD.test(food.preparation) || RAW_WORD.test(food.name)) {
    return `${food.id} está cru e não pode ser tratado como pronto.`;
  }
  if (!CATEGORIES.has(food.category)) return `Categoria inválida em ${food.id}.`;
  if (!Array.isArray(food.meals) || food.meals.length === 0) {
    return `${food.id} não está em nenhuma refeição.`;
  }
  for (const meal of food.meals) {
    if (!MEAL_KEYS.has(meal)) return `Refeição inválida em ${food.id}: ${meal}.`;
  }
  if (food.tags !== undefined) {
    if (!Array.isArray(food.tags)) return `Tags inválidas em ${food.id}.`;
    for (const tag of food.tags) {
      if (!TAGS.has(tag)) return `Tag inválida em ${food.id}: ${tag}.`;
    }
  }
  if (food.unit !== undefined) {
    const unit = food.unit;
    if (!unit.singular?.trim() || !unit.plural?.trim()) {
      return `Unidade sem nome em ${food.id}.`;
    }
    if (!Number.isFinite(unit.gramsPerUnit) || unit.gramsPerUnit <= 0) {
      return `Gramas por unidade inválidas em ${food.id}.`;
    }
    if (!(unit.stepUnits > 0) || unit.stepUnits > 1) {
      return `Passo de unidade inválido em ${food.id}.`;
    }
  }
  if (!Number.isFinite(food.caloriesPer100g) || food.caloriesPer100g <= 0) {
    return `Calorias inválidas em ${food.id}.`;
  }
  if (
    food.carbohydrateBasis !== undefined &&
    !CARBOHYDRATE_BASES.has(food.carbohydrateBasis)
  ) {
    return `Base de carboidrato inválida em ${food.id}.`;
  }
  if (food.restrictions !== undefined) {
    for (const value of Object.values(food.restrictions)) {
      if (!RESTRICTION_KNOWLEDGE.has(value)) {
        return `Restrição inválida em ${food.id}.`;
      }
    }
  }
  if (!food.source?.name?.trim() || !food.source.code?.trim()) {
    return `Fonte ausente em ${food.id}.`;
  }
  if (!ISO_DATE.test(food.source.accessedAt)) {
    return `Data de acesso inválida em ${food.id}.`;
  }
  return null;
}

export function loadCatalog(records: readonly Food[]): {
  active: Food[];
  problems: string[];
} {
  const problems: string[] = [];
  const active: Food[] = [];
  for (const food of records) {
    const issue = catalogIssue(food);
    if (issue) problems.push(issue);
    if (!issue && food.active) active.push(food);
  }
  return {
    active: active.sort((a, b) => a.sortOrder - b.sortOrder),
    problems,
  };
}

const loaded = loadCatalog(rawFoods as Food[]);

if (import.meta.env?.DEV) {
  for (const problem of loaded.problems) {
    console.warn(`[meal-guide] ${problem}`);
  }
}

export const foods = loaded.active;

/**
 * Limites iniciais da busca, por alimento.
 * Pão, ovo e aveia têm faixa própria. Os demais em gramas usam a faixa do grupo.
 * Alimento com unidade que não está nesses casos não herda a faixa em gramas:
 * precisa de limites próprios antes de entrar na otimização.
 */
export function expectedPortionBounds(
  food: Pick<Food, "id" | "category" | "unit">,
): FoodPortionBounds | null {
  if (food.id === "pao-frances") {
    return { minimum: 0.5, maximum: 2, step: 0.5 };
  }
  if (food.id === "ovo") {
    return { minimum: 0.5, maximum: 4, step: 0.5 };
  }
  if (food.id === "aveia") {
    return { minimum: 10, maximum: 100, step: null };
  }
  if (food.unit) return null;
  if (food.category === "carbohydrate") {
    return { minimum: 20, maximum: 400, step: null };
  }
  if (food.category === "protein") {
    return { minimum: 20, maximum: 300, step: null };
  }
  return null;
}

function samePortionBounds(a: FoodPortionBounds, b: FoodPortionBounds): boolean {
  return a.minimum === b.minimum && a.maximum === b.maximum && a.step === b.step;
}

function snapToStep(value: number, step: number, direction: "ceil" | "floor"): number {
  const units = value / step;
  const snappedUnits =
    direction === "ceil"
      ? Math.ceil(units - SNAP_EPSILON)
      : Math.floor(units + SNAP_EPSILON);
  return Math.round(snappedUnits * step * 1e6) / 1e6;
}

export type PortionDomain =
  | { ok: true; constraints: PortionConstraints }
  | { ok: false; foodId: string; message: string };

/**
 * Ajusta mínimo e máximo ao passo: ceil no mínimo, floor no máximo.
 * Domínio vazio é erro de configuração. Não interrompe o carregamento do app.
 * Alimento em unidade usa o passo da unidade e ignora o incremento do perfil.
 */
export function portionDomain(
  food: Food,
  roundingIncrementGrams: number,
): PortionDomain {
  const fail = (message: string): PortionDomain => ({
    ok: false,
    foodId: food.id,
    message,
  });
  const bounds = food.portionBounds;
  if (!bounds) return fail(`Limites de porção ausentes em ${food.id}.`);
  if (
    !Number.isFinite(bounds.minimum) ||
    bounds.minimum <= 0 ||
    !Number.isFinite(bounds.maximum)
  ) {
    return fail(`Limites de porção inválidos em ${food.id}.`);
  }
  if (food.unit && bounds.step === null) {
    return fail(`Passo de porção inválido em ${food.id}.`);
  }
  if (food.unit && bounds.step !== food.unit.stepUnits) {
    return fail(`Passo de porção inválido em ${food.id}.`);
  }
  const step = bounds.step === null ? roundingIncrementGrams : bounds.step;
  if (!Number.isFinite(step) || step <= 0) {
    return fail(`Passo de porção inválido em ${food.id}.`);
  }
  const minimum = snapToStep(bounds.minimum, step, "ceil");
  const maximum = snapToStep(bounds.maximum, step, "floor");
  if (!(minimum > 0) || minimum > maximum) {
    return fail(`Domínio de porção vazio em ${food.id}.`);
  }
  return {
    ok: true,
    constraints: {
      foodId: food.id,
      minimum,
      maximum,
      step,
      unit: food.unit ?? null,
    },
  };
}

function knownNutrient(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Carboidrato que o solver de macros usa.
 * Com base available, é carbohydratePer100g. Nos demais casos, é
 * availableCarbohydratePer100g quando esse número é finito.
 * Não lê o total no lugar do disponível e não altera o campo antigo.
 */
export function carbohydrateForMacroOptimization(food: Food): number | null {
  if (food.carbohydrateBasis === "available") {
    return knownNutrient(food.carbohydratePer100g) ? food.carbohydratePer100g : null;
  }
  return knownNutrient(food.availableCarbohydratePer100g)
    ? food.availableCarbohydratePer100g
    : null;
}

/**
 * Única regra de elegibilidade para o solver de macros.
 * O montador calórico continua com o catálogo legado.
 * O campo antigo permanece como foi gravado; o solver usa o disponível.
 */
export function macroOptimizationIssue(
  food: Food,
  roundingIncrementGrams = 10,
): string | null {
  const reasons: string[] = [];
  const missing: string[] = [];
  if (!knownNutrient(food.proteinPer100g)) missing.push("proteína");
  if (!knownNutrient(food.fatPer100g)) missing.push("gordura");
  if (!Number.isFinite(food.caloriesPer100g) || food.caloriesPer100g <= 0) {
    missing.push("calorias");
  }
  if (missing.length > 0) {
    reasons.push(`Nutriente desconhecido em ${food.id}: ${missing.join(", ")}.`);
  }
  if (carbohydrateForMacroOptimization(food) === null) {
    reasons.push(`Base do carboidrato não normalizada em ${food.id}.`);
  }
  const expected = expectedPortionBounds(food);
  if (!food.portionBounds) {
    reasons.push(
      expected
        ? `Limites de porção ausentes em ${food.id}.`
        : `Limites de porção próprios ausentes em ${food.id}.`,
    );
  } else if (expected && !samePortionBounds(food.portionBounds, expected)) {
    reasons.push(`Limites de porção divergentes em ${food.id}.`);
  } else {
    const domain = portionDomain(food, roundingIncrementGrams);
    if (!domain.ok) reasons.push(domain.message);
  }
  return reasons.length > 0 ? reasons.join(" ") : null;
}

export function isMacroOptimizationEnabled(
  food: Food,
  roundingIncrementGrams = 10,
): boolean {
  return macroOptimizationIssue(food, roundingIncrementGrams) === null;
}

export function foodsForMacroOptimization(
  source: readonly Food[] = foods,
  roundingIncrementGrams = 10,
): Food[] {
  return source.filter((food) =>
    isMacroOptimizationEnabled(food, roundingIncrementGrams),
  );
}

/**
 * Chave ausente, valor inválido ou unknown continuam desconhecidos.
 * Só verified_absent é compatível com a restrição.
 */
export function restrictionKnowledge(
  food: Food,
  restriction: SupportedRestriction,
): RestrictionKnowledge {
  const value = food.restrictions?.[restriction];
  if (value === "present" || value === "verified_absent" || value === "unknown") {
    return value;
  }
  return "unknown";
}

export function isCompatibleWithRestriction(
  food: Food,
  restriction: SupportedRestriction,
): boolean {
  return restrictionKnowledge(food, restriction) === "verified_absent";
}

export function isCompatibleWithRestrictions(
  food: Food,
  restrictions: readonly SupportedRestriction[],
): boolean {
  return restrictions.every((restriction) =>
    isCompatibleWithRestriction(food, restriction),
  );
}

/**
 * Compara a energia cadastrada com 4/4/9 usando o carboidrato do solver.
 * Não troca carbohydratePer100g pelo disponível e não altera caloriesPer100g.
 * Sem macro finito, não há triagem e o desconhecido não vira zero.
 */
export function energyReviewPending(food: Food): string | null {
  const carbohydrate = carbohydrateForMacroOptimization(food);
  if (
    !knownNutrient(food.proteinPer100g) ||
    carbohydrate === null ||
    !knownNutrient(food.fatPer100g) ||
    !Number.isFinite(food.caloriesPer100g) ||
    food.caloriesPer100g <= 0
  ) {
    return null;
  }
  const estimated =
    KCAL_PER_GRAM.protein * food.proteinPer100g +
    KCAL_PER_GRAM.carbohydrate * carbohydrate +
    KCAL_PER_GRAM.fat * food.fatPer100g;
  const delta = Math.abs(food.caloriesPer100g - estimated);
  if (delta > food.caloriesPer100g * ENERGY_REVIEW_RATIO) {
    return `Pendência de revisão energética em ${food.id}.`;
  }
  return null;
}

export function foodsByCategory(
  category: FoodCategory,
  meal: MealKey,
  excludedTags: readonly FoodTag[] = [],
  source: readonly Food[] = foods,
  restrictions: readonly SupportedRestriction[] = [],
): Food[] {
  return source.filter(
    (food) =>
      food.category === category &&
      food.meals.includes(meal) &&
      !(food.tags ?? []).some((tag) => excludedTags.includes(tag)) &&
      isCompatibleWithRestrictions(food, restrictions),
  );
}
