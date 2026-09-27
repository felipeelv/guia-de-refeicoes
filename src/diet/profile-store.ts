import type { Diagnostic, PersonKey, ProfileStoreV2 } from "../domain/types.ts";
import { PROFILE_STORE_V2_KEY_PREFIX } from "../domain/types.ts";

/**
 * Armazenamento injetado. Os testes usam um mapa em memória.
 * Este módulo não lê nem apaga localStorage.
 */
export interface ProfileStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  keys(): Iterable<string>;
}

/** Aviso fixo quando a escrita durável não aconteceu. */
export const UNSAVED_DEVICE_MESSAGE =
  "Alterações não salvas neste dispositivo";

/** Janela atual do diário, igual à retenção v1. O dia-limite inclusive fica. */
export const DIARY_RETENTION_DAYS = 7;

const PERSON_KEYS = new Set<PersonKey>(["felipe", "gabriela", "kelly"]);
const MEAL_KEYS = new Set([
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
]);
const ACTIVATION_STATUSES = new Set([
  "scheduled",
  "active",
  "cancelled",
  "superseded",
]);
const PLAN_ORIGINS = new Set(["confirmed", "legacy_inferred"]);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FOOD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Separa o envelope por personKey. Isso não autentica a pessoa
 * e não cria uma conta privada.
 */
export function profileStorageKey(personKey: PersonKey): string {
  return `${PROFILE_STORE_V2_KEY_PREFIX}${personKey}`;
}

export function saoPauloCalendarDate(instant: Date): string {
  const parts = DATE_PARTS.formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Não foi possível ler a data em America/Sao_Paulo.");
  }
  return `${year}-${month}-${day}`;
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error(`Data inválida: ${isoDate}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const shiftedYear = utc.getUTCFullYear();
  const shiftedMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function emptyProfile(personKey: PersonKey): ProfileStoreV2 {
  return {
    schemaVersion: 2,
    personKey,
    revision: 0,
    draftAssessment: null,
    confirmedAssessment: null,
    plans: [],
    activations: [],
    days: [],
    savedFoodIds: [],
  };
}

function issue(message: string): Diagnostic {
  return { code: "invalid_schema", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFinite(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function validateNutrients(value: unknown, label: string, diagnostics: Diagnostic[]): boolean {
  if (!isRecord(value)) {
    diagnostics.push(issue(`${label}: nutrientes ausentes.`));
    return false;
  }
  const fields = ["calories", "proteinGrams", "carbohydrateGrams", "fatGrams"] as const;
  let ok = true;
  for (const field of fields) {
    if (!isNullableFinite(value[field])) {
      diagnostics.push(issue(`${label}: ${field} precisa ser número ou nulo.`));
      ok = false;
    }
  }
  return ok;
}

function validateTargets(value: unknown, label: string, diagnostics: Diagnostic[]): boolean {
  if (!isRecord(value)) {
    diagnostics.push(issue(`${label}: metas ausentes.`));
    return false;
  }
  let ok = true;
  for (const field of ["calories", "proteinGrams", "carbohydrateGrams", "fatGrams"] as const) {
    if (!isFiniteNumber(value[field])) {
      diagnostics.push(issue(`${label}: ${field} inválido.`));
      ok = false;
    }
  }
  return ok;
}

function validateAssessment(
  value: unknown,
  personKey: PersonKey,
  label: string,
  diagnostics: Diagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(issue(`${label}: avaliação inválida.`));
    return false;
  }
  if (value.personKey !== personKey) {
    diagnostics.push(issue(`${label}: avaliação de outra pessoa.`));
    return false;
  }
  return true;
}

export function validateProfileStore(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) return [issue("Envelope inválido.")];
  if (value.schemaVersion !== 2) diagnostics.push(issue("schemaVersion precisa ser 2."));
  if (!PERSON_KEYS.has(value.personKey as PersonKey)) {
    diagnostics.push(issue("personKey inválida."));
  }
  const personKey = value.personKey as PersonKey;
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    diagnostics.push(issue("revision precisa ser um inteiro >= 0."));
  }
  if ("savedFoodIds" in value && value.savedFoodIds !== undefined) {
    if (!Array.isArray(value.savedFoodIds)) {
      diagnostics.push(issue("savedFoodIds precisa ser uma lista."));
    } else {
      const seen = new Set<string>();
      for (const id of value.savedFoodIds) {
        if (typeof id !== "string" || !FOOD_ID.test(id)) {
          diagnostics.push(issue("savedFoodIds contém id inválido."));
          break;
        }
        if (seen.has(id)) {
          diagnostics.push(issue(`Alimento salvo repetido: ${id}.`));
          break;
        }
        seen.add(id);
      }
    }
  }
  if (value.draftAssessment !== null) {
    validateAssessment(value.draftAssessment, personKey, "Rascunho", diagnostics);
  }
  if (value.confirmedAssessment !== null) {
    validateAssessment(value.confirmedAssessment, personKey, "Respostas confirmadas", diagnostics);
  }
  const plans = value.plans;
  const activations = value.activations;
  const days = value.days;
  if (!Array.isArray(plans)) diagnostics.push(issue("plans precisa ser uma lista."));
  if (!Array.isArray(activations)) diagnostics.push(issue("activations precisa ser uma lista."));
  if (!Array.isArray(days)) diagnostics.push(issue("days precisa ser uma lista."));
  if (diagnostics.length > 0 || !Array.isArray(plans) || !Array.isArray(activations) || !Array.isArray(days)) {
    return diagnostics;
  }

  const planIds = new Set<string>();
  for (const plan of plans) {
    if (!isRecord(plan) || typeof plan.id !== "string" || plan.id.length === 0) {
      diagnostics.push(issue("Plano sem id."));
      continue;
    }
    if (planIds.has(plan.id)) diagnostics.push(issue(`Plano repetido: ${plan.id}.`));
    planIds.add(plan.id);
    if (plan.personKey !== personKey) diagnostics.push(issue(`Plano ${plan.id} de outra pessoa.`));
    if (!PLAN_ORIGINS.has(String(plan.origin))) {
      diagnostics.push(issue(`Plano ${plan.id} sem origem válida.`));
    }
    if (plan.policyId !== "experimental-v1") {
      diagnostics.push(issue(`Plano ${plan.id} com política desconhecida.`));
    }
    if (typeof plan.createdAt !== "string") diagnostics.push(issue(`Plano ${plan.id} sem data.`));
    validateTargets(plan.daily, `Plano ${plan.id}`, diagnostics);
    validateAssessment(plan.assessment, personKey, `Plano ${plan.id}`, diagnostics);
    if (!Array.isArray(plan.meals) || plan.meals.length === 0) {
      diagnostics.push(issue(`Plano ${plan.id} sem refeições.`));
    } else {
      for (const meal of plan.meals) {
        if (!isRecord(meal) || !MEAL_KEYS.has(String(meal.mealKey))) {
          diagnostics.push(issue(`Refeição inválida no plano ${plan.id}.`));
          continue;
        }
        validateTargets(meal, `Plano ${plan.id}/${String(meal.mealKey)}`, diagnostics);
        if (!isFiniteNumber(meal.share) || meal.share < 0) {
          diagnostics.push(issue(`Peso inválido em ${String(meal.mealKey)}.`));
        }
      }
    }
  }

  const activationIds = new Set<string>();
  for (const activation of activations) {
    if (!isRecord(activation) || typeof activation.id !== "string") {
      diagnostics.push(issue("Ativação sem id."));
      continue;
    }
    if (activationIds.has(activation.id)) {
      diagnostics.push(issue(`Ativação repetida: ${activation.id}.`));
    }
    activationIds.add(activation.id);
    if (activation.personKey !== personKey) {
      diagnostics.push(issue(`Ativação ${activation.id} de outra pessoa.`));
    }
    if (typeof activation.planId !== "string" || !planIds.has(activation.planId)) {
      diagnostics.push(issue(`Ativação ${activation.id} aponta para plano ausente.`));
    }
    if (typeof activation.effectiveDate !== "string" || !ISO_DATE.test(activation.effectiveDate)) {
      diagnostics.push(issue(`Ativação ${activation.id} com data inválida.`));
    }
    if (!ACTIVATION_STATUSES.has(String(activation.status))) {
      diagnostics.push(issue(`Ativação ${activation.id} com estado inválido.`));
    }
    if (typeof activation.createdAt !== "string") {
      diagnostics.push(issue(`Ativação ${activation.id} sem instante.`));
    }
  }

  const dayDates = new Set<string>();
  const entryIds = new Set<string>();
  for (const day of days) {
    if (!isRecord(day) || typeof day.date !== "string" || !ISO_DATE.test(day.date)) {
      diagnostics.push(issue("Dia com data inválida."));
      continue;
    }
    if (dayDates.has(day.date)) diagnostics.push(issue(`Dia repetido: ${day.date}.`));
    dayDates.add(day.date);
    if (day.snapshot !== null) {
      if (!isRecord(day.snapshot)) {
        diagnostics.push(issue(`Cópia do dia ${day.date} inválida.`));
      } else {
        if (day.snapshot.date !== day.date) {
          diagnostics.push(issue(`Cópia do dia ${day.date} com data divergente.`));
        }
        if (day.snapshot.personKey !== personKey) {
          diagnostics.push(issue(`Cópia do dia ${day.date} de outra pessoa.`));
        }
        if (day.snapshot.frozenAt !== null && typeof day.snapshot.frozenAt !== "string") {
          diagnostics.push(issue(`Congelamento inválido em ${day.date}.`));
        }
        validateTargets(day.snapshot.baseDaily, `Base diária ${day.date}`, diagnostics);
        if (!Array.isArray(day.snapshot.baseMeals)) {
          diagnostics.push(issue(`Base das refeições ausente em ${day.date}.`));
        }
        if (!isRecord(day.snapshot.plan)) {
          diagnostics.push(issue(`Plano do dia ${day.date} ausente.`));
        }
      }
    }
    if (!Array.isArray(day.entries)) {
      diagnostics.push(issue(`Lançamentos inválidos em ${day.date}.`));
      continue;
    }
    for (const entry of day.entries) {
      if (!isRecord(entry) || typeof entry.id !== "string") {
        diagnostics.push(issue(`Lançamento inválido em ${day.date}.`));
        continue;
      }
      if (entryIds.has(entry.id)) diagnostics.push(issue(`Lançamento repetido: ${entry.id}.`));
      entryIds.add(entry.id);
      if (entry.personKey !== personKey) {
        diagnostics.push(issue(`Lançamento ${entry.id} de outra pessoa.`));
      }
      if (entry.date !== day.date) diagnostics.push(issue(`Lançamento ${entry.id} fora do dia.`));
      if (!MEAL_KEYS.has(String(entry.mealKey))) {
        diagnostics.push(issue(`Refeição inválida no lançamento ${entry.id}.`));
      }
      if (!isFiniteNumber(entry.grams) || entry.grams <= 0) {
        diagnostics.push(issue(`Quantidade inválida no lançamento ${entry.id}.`));
      }
      validateNutrients(entry.nutrients, entry.id, diagnostics);
    }
  }
  return diagnostics;
}

export type LoadProfileResult =
  | { ok: true; profile: ProfileStoreV2 }
  | { ok: false; reason: "missing" | "invalid" | "storage_failed"; diagnostics: readonly Diagnostic[] };

export function loadProfile(storage: ProfileStorage, personKey: PersonKey): LoadProfileResult {
  let raw: string | null;
  try {
    raw = storage.get(profileStorageKey(personKey));
  } catch {
    return {
      ok: false,
      reason: "storage_failed",
      diagnostics: [issue("Falha ao ler o envelope.")],
    };
  }
  if (raw == null) return { ok: false, reason: "missing", diagnostics: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    const diagnostics = validateProfileStore(parsed);
    if (diagnostics.length > 0) return { ok: false, reason: "invalid", diagnostics };
    const stored = parsed as ProfileStoreV2;
    const rawIds = (parsed as { savedFoodIds?: unknown }).savedFoodIds;
    const savedFoodIds = Array.isArray(rawIds)
      ? rawIds.filter((item): item is string => typeof item === "string")
      : [];
    return { ok: true, profile: { ...stored, savedFoodIds } };
  } catch {
    return {
      ok: false,
      reason: "invalid",
      diagnostics: [issue("Envelope ilegível.")],
    };
  }
}

export type ProfileSaveReason = "storage_failed" | "revision_conflict" | "invalid_schema";

export type ProfileSaveResult =
  | { persisted: true; profile: ProfileStoreV2 }
  | {
      persisted: false;
      reason: ProfileSaveReason;
      message: typeof UNSAVED_DEVICE_MESSAGE;
      profile: ProfileStoreV2;
    };

function notPersisted(reason: ProfileSaveReason, profile: ProfileStoreV2): ProfileSaveResult {
  return { persisted: false, reason, message: UNSAVED_DEVICE_MESSAGE, profile };
}

/**
 * Uma escrita substitui o envelope inteiro. A revisão só avança depois que
 * a releitura confere com o que foi gravado.
 */
export function saveProfile(storage: ProfileStorage, profile: ProfileStoreV2): ProfileSaveResult {
  const diagnostics = validateProfileStore(profile);
  if (diagnostics.length > 0) return notPersisted("invalid_schema", profile);

  const key = profileStorageKey(profile.personKey);
  let currentRaw: string | null;
  try {
    currentRaw = storage.get(key);
  } catch {
    return notPersisted("storage_failed", profile);
  }

  if (currentRaw == null) {
    if (profile.revision !== 0) return notPersisted("revision_conflict", profile);
  } else {
    let current: unknown;
    try {
      current = JSON.parse(currentRaw);
    } catch {
      return notPersisted("storage_failed", profile);
    }
    const currentIssues = validateProfileStore(current);
    if (currentIssues.length > 0) return notPersisted("storage_failed", profile);
    const stored = current as ProfileStoreV2;
    if (stored.revision !== profile.revision) return notPersisted("revision_conflict", profile);
  }

  const next: ProfileStoreV2 = { ...profile, revision: profile.revision + 1 };
  const nextIssues = validateProfileStore(next);
  if (nextIssues.length > 0) return notPersisted("invalid_schema", profile);

  let serial: string;
  try {
    serial = JSON.stringify(next);
  } catch {
    return notPersisted("storage_failed", profile);
  }

  try {
    const latest = storage.get(key);
    if (latest !== currentRaw) return notPersisted("revision_conflict", profile);
    storage.set(key, serial);
  } catch {
    return notPersisted("storage_failed", profile);
  }

  let reread: string | null;
  try {
    reread = storage.get(key);
  } catch {
    return notPersisted("storage_failed", profile);
  }
  if (reread !== serial) return notPersisted("storage_failed", profile);

  try {
    const parsed: unknown = JSON.parse(reread);
    const parsedIssues = validateProfileStore(parsed);
    if (parsedIssues.length > 0) return notPersisted("storage_failed", profile);
    const stored = parsed as ProfileStoreV2;
    if (stored.revision !== next.revision) return notPersisted("storage_failed", profile);
    return { persisted: true, profile: stored };
  } catch {
    return notPersisted("storage_failed", profile);
  }
}

/**
 * Remove dias anteriores à janela de sete dias.
 * Planos e ativações — inclusive o ativo e o agendado — permanecem.
 */
export function retainDiaryDays(profile: ProfileStoreV2, today: string): ProfileStoreV2 {
  const cutoff = shiftIsoDate(today, -DIARY_RETENTION_DAYS);
  return {
    ...profile,
    plans: profile.plans,
    activations: profile.activations,
    days: profile.days.filter((day) => day.date >= cutoff),
  };
}
