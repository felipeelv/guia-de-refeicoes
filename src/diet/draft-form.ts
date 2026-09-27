import { MEAL_KEYS } from "../domain/nutrition/distribute-targets.ts";
import { parseBrazilianDecimal } from "../domain/nutrition/nutrition-validation.ts";
import type { DietAssessmentInput } from "../domain/nutrition/nutrition-validation.ts";
import type {
  ActivityLevel,
  DietAssessment,
  DietGoal,
  EquationCoefficient,
  FoodTag,
  MealKey,
  Person,
  PersonKey,
  SupportedRestriction,
} from "../domain/types.ts";
import { SUPPORTED_RESTRICTIONS } from "../domain/types.ts";
import type { DraftStorage } from "./browser-storage.ts";

export const DRAFT_FORM_PREFIX = "meal-guide:v2:draft-form:";

export interface DietFormState {
  ageYears: string;
  height: string;
  heightUnit: "cm" | "m";
  weightKg: string;
  equationCoefficient: "" | EquationCoefficient;
  goal: "" | DietGoal;
  activityLevel: "" | ActivityLevel;
  desiredWeightKg: string;
  preferredFoodIds: string[];
  avoidedFoodIds: string[];
  avoidedGroups: FoodTag[];
  allergyMode: "none_reported" | "reported";
  allergyItems: SupportedRestriction[];
  freeTextNote: string;
  pregnantOrLactating: "" | "yes" | "no";
  therapeuticDietRequired: "" | "yes" | "no";
  mealPercents: Record<MealKey, string>;
}

export function draftFormKey(personKey: PersonKey): string {
  return `${DRAFT_FORM_PREFIX}${personKey}`;
}

export function formatDraftNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

export function emptyDietForm(person: Person): DietFormState {
  const mealPercents = {} as Record<MealKey, string>;
  for (const key of MEAL_KEYS) {
    const meal = person.meals.find((item) => item.key === key);
    const percent =
      meal && person.dailyCalories > 0
        ? (meal.targetCalories / person.dailyCalories) * 100
        : 0;
    mealPercents[key] = formatDraftNumber(percent);
  }
  return {
    ageYears: "",
    height: "",
    heightUnit: "cm",
    weightKg: "",
    equationCoefficient: "",
    goal: "",
    activityLevel: "",
    desiredWeightKg: "",
    preferredFoodIds: [],
    avoidedFoodIds: [],
    avoidedGroups: [],
    allergyMode: "none_reported",
    allergyItems: [],
    freeTextNote: "",
    pregnantOrLactating: "",
    therapeuticDietRequired: "",
    mealPercents,
  };
}

export function formFromAssessment(
  assessment: DietAssessment,
  person: Person,
): DietFormState {
  const base = emptyDietForm(person);
  const mealPercents = { ...base.mealPercents };
  if (assessment.mealShares) {
    for (const key of MEAL_KEYS) {
      mealPercents[key] = formatDraftNumber(assessment.mealShares[key] * 100);
    }
  }
  const allergies = assessment.allergies;
  return {
    ...base,
    ageYears: formatDraftNumber(assessment.ageYears),
    height: formatDraftNumber(assessment.heightCm),
    heightUnit: "cm",
    weightKg: formatDraftNumber(assessment.weightKg),
    equationCoefficient: assessment.equationCoefficient,
    goal: assessment.goal,
    activityLevel: assessment.activityLevel,
    desiredWeightKg:
      assessment.desiredWeightKg == null
        ? ""
        : formatDraftNumber(assessment.desiredWeightKg),
    preferredFoodIds: [...assessment.preferredFoodIds],
    avoidedFoodIds: [...assessment.avoidedFoodIds],
    avoidedGroups: [...assessment.avoidedGroups],
    allergyMode: allergies.status,
    allergyItems:
      allergies.status === "reported"
        ? allergies.items.filter(isSupportedRestriction)
        : [],
    freeTextNote: assessment.freeTextNote ?? "",
    pregnantOrLactating:
      assessment.pregnantOrLactating == null
        ? ""
        : assessment.pregnantOrLactating
          ? "yes"
          : "no",
    therapeuticDietRequired:
      assessment.therapeuticDietRequired == null
        ? ""
        : assessment.therapeuticDietRequired
          ? "yes"
          : "no",
    mealPercents,
  };
}

function isSupportedRestriction(value: string): value is SupportedRestriction {
  return (SUPPORTED_RESTRICTIONS as readonly string[]).includes(value);
}

export function mealSharesFromForm(
  percents: Record<MealKey, string>,
): Record<MealKey, number> {
  const shares = {} as Record<MealKey, number>;
  for (const key of MEAL_KEYS) {
    const value = parseBrazilianDecimal(percents[key] ?? "");
    shares[key] = Number.isFinite(value) ? value / 100 : Number.NaN;
  }
  return shares;
}

export function assessmentInputFromForm(
  personKey: PersonKey,
  form: DietFormState,
): DietAssessmentInput {
  return {
    personKey,
    ageYears: form.ageYears,
    height: form.height,
    heightUnit: form.heightUnit,
    weightKg: form.weightKg,
    equationCoefficient: form.equationCoefficient,
    goal: form.goal,
    activityLevel: form.activityLevel,
    desiredWeightKg: form.desiredWeightKg.trim() === "" ? "" : form.desiredWeightKg,
    preferredFoodIds: form.preferredFoodIds,
    avoidedFoodIds: form.avoidedFoodIds,
    avoidedGroups: form.avoidedGroups,
    allergies:
      form.allergyMode === "reported"
        ? { status: "reported", items: form.allergyItems }
        : { status: "none_reported" },
    freeTextNote: form.freeTextNote.trim() === "" ? null : form.freeTextNote,
    pregnantOrLactating:
      form.pregnantOrLactating === "" ? null : form.pregnantOrLactating === "yes",
    therapeuticDietRequired:
      form.therapeuticDietRequired === ""
        ? null
        : form.therapeuticDietRequired === "yes",
    mealShares: mealSharesFromForm(form.mealPercents),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function readDietDraft(
  storage: DraftStorage,
  personKey: PersonKey,
): DietFormState | null {
  let raw: string | null;
  try {
    raw = storage.get(draftFormKey(personKey));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const form = parsed as Partial<DietFormState>;
    if (typeof form.ageYears !== "string" || typeof form.height !== "string") return null;
    if (form.heightUnit !== "cm" && form.heightUnit !== "m") return null;
    if (!form.mealPercents || typeof form.mealPercents !== "object") return null;
    if (!isStringArray(form.preferredFoodIds) || !isStringArray(form.avoidedFoodIds)) {
      return null;
    }
    return form as DietFormState;
  } catch {
    return null;
  }
}

export function writeDietDraft(
  storage: DraftStorage,
  personKey: PersonKey,
  form: DietFormState,
): void {
  storage.set(draftFormKey(personKey), JSON.stringify(form));
}

export function clearDietDraft(storage: DraftStorage, personKey: PersonKey): void {
  storage.remove(draftFormKey(personKey));
}

export function initialDietForm(
  storage: DraftStorage,
  person: Person,
  confirmed: DietAssessment | null,
): DietFormState {
  return (
    readDietDraft(storage, person.key) ??
    (confirmed ? formFromAssessment(confirmed, person) : emptyDietForm(person))
  );
}
