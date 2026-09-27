import type {
  Diagnostic,
  DietAssessment,
  DietPlan,
  FoodSource,
  FrozenNutrients,
  LogEntryV2,
  MealKey,
  MealNutritionTarget,
  MigrationResult,
  PersonKey,
  PlanActivation,
  ProfileDayState,
  ProfileStoreV2,
} from "../domain/types.ts";
import { makeDaySnapshot } from "./plan-activation.ts";
import {
  emptyProfile,
  loadProfile,
  saveProfile,
  saoPauloCalendarDate,
  validateProfileStore,
  type ProfileStorage,
} from "./profile-store.ts";

export const V1_LOG_PREFIX = "meal-guide:v1:log:";

/** A v1 não guardava o retrato nutricional. A reconstrução fica marcada. */
export const MIGRATED_ESTIMATE_FOOD_VERSION = "migrated-estimate";

const MEAL_KEYS: readonly MealKey[] = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
];

export interface MigrationFood {
  name: string;
  preparation: string;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbohydratePer100g: number | null;
  fatPer100g: number | null;
  source: FoodSource;
}

export interface LegacyMealTarget {
  mealKey: MealKey;
  calories: number;
}

export interface MigrateProfileV1Input {
  storage: ProfileStorage;
  personKey: PersonKey;
  now: Date;
  foodsById: ReadonlyMap<string, MigrationFood>;
  dailyCalories: number;
  meals: readonly LegacyMealTarget[];
  catalogVersion: string;
}

interface V1Row {
  key: string;
  raw: string;
  day: string;
}

interface V1Entry {
  id: string;
  foodId: string;
  grams: number;
  mealKey: MealKey;
  createdAt: string;
}

function diagnostic(code: string, message: string): Diagnostic {
  return { code, message };
}

export function migrationFlagKey(personKey: PersonKey): string {
  return `meal-guide:v2:migration:${personKey}`;
}

export function legacyPlanId(personKey: PersonKey): string {
  return `legacy-inferred:${personKey}`;
}

function failure(
  diagnostics: readonly Diagnostic[],
  legacyPreserved: boolean,
  profile: ProfileStoreV2 | null = null,
): MigrationResult {
  return { ok: false, profile, legacyPreserved, diagnostics };
}

function parseV1Key(key: string): { personKey: string; day: string } | null {
  if (!key.startsWith(V1_LOG_PREFIX)) return null;
  const rest = key.slice(V1_LOG_PREFIX.length);
  const separator = rest.lastIndexOf(":");
  if (separator <= 0) return null;
  const personKey = rest.slice(0, separator);
  const day = rest.slice(separator + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { personKey, day };
}

function captureV1(storage: ProfileStorage, personKey: PersonKey): V1Row[] | null {
  try {
    const rows: V1Row[] = [];
    for (const key of storage.keys()) {
      const parsed = parseV1Key(key);
      if (!parsed || parsed.personKey !== personKey) continue;
      const raw = storage.get(key);
      if (raw == null) continue;
      rows.push({ key, raw, day: parsed.day });
    }
    rows.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
    return rows;
  } catch {
    return null;
  }
}

function v1Unchanged(storage: ProfileStorage, rows: readonly V1Row[]): boolean {
  try {
    return rows.every((row) => storage.get(row.key) === row.raw);
  } catch {
    return false;
  }
}

function isMealKey(value: unknown): value is MealKey {
  return typeof value === "string" && MEAL_KEYS.includes(value as MealKey);
}

function parseV1Entries(raw: string, now: string): { entries: V1Entry[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: [], skipped: 1 };
  }
  if (!Array.isArray(parsed)) return { entries: [], skipped: 1 };
  const entries: V1Entry[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      skipped += 1;
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.foodId !== "string" ||
      entry.foodId.length === 0 ||
      typeof entry.grams !== "number" ||
      !Number.isFinite(entry.grams) ||
      entry.grams <= 0 ||
      !isMealKey(entry.mealKey)
    ) {
      skipped += 1;
      continue;
    }
    entries.push({
      id: entry.id,
      foodId: entry.foodId,
      grams: entry.grams,
      mealKey: entry.mealKey,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
    });
  }
  return { entries, skipped };
}

function scaled(grams: number, per100g: number | null): number | null {
  if (per100g == null || !Number.isFinite(per100g)) return null;
  return (grams * per100g) / 100;
}

function nutrientsFor(grams: number, food: MigrationFood | undefined): FrozenNutrients {
  if (!food || !Number.isFinite(food.caloriesPer100g)) {
    return {
      calories: null,
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
    };
  }
  return {
    calories: scaled(grams, food.caloriesPer100g),
    proteinGrams: scaled(grams, food.proteinPer100g),
    carbohydrateGrams: scaled(grams, food.carbohydratePer100g),
    fatGrams: scaled(grams, food.fatPer100g),
  };
}

function unknownSource(today: string): FoodSource {
  return { name: "desconhecido", code: "missing-food", accessedAt: today };
}

function toLogEntry(
  personKey: PersonKey,
  day: string,
  entry: V1Entry,
  food: MigrationFood | undefined,
  planId: string,
  today: string,
): LogEntryV2 {
  const source = food?.source ?? unknownSource(today);
  return {
    id: entry.id,
    batchId: `migrated:${entry.id}`,
    personKey,
    date: day,
    mealKey: entry.mealKey,
    foodId: entry.foodId,
    foodName: food?.name ?? entry.foodId,
    preparation: food?.preparation ?? "",
    grams: entry.grams,
    units: null,
    nutrients: nutrientsFor(entry.grams, food),
    source,
    foodVersion: MIGRATED_ESTIMATE_FOOD_VERSION,
    dayPlanId: planId,
    createdAt: entry.createdAt,
  };
}

/**
 * A avaliação numérica não foi armazenada na v1. Os zeros não são medidas;
 * confirmedAssessment continua nulo e a origem impede uso como questionário.
 */
function legacyAssessment(
  personKey: PersonKey,
  meals: readonly LegacyMealTarget[],
  dailyCalories: number,
): DietAssessment {
  const mealShares = MEAL_KEYS.every((key) => meals.some((meal) => meal.mealKey === key))
    ? MEAL_KEYS.reduce(
        (shares, key) => {
          const meal = meals.find((item) => item.mealKey === key);
          shares[key] = meal ? meal.calories / dailyCalories : 0;
          return shares;
        },
        {} as Record<MealKey, number>,
      )
    : null;
  return {
    personKey,
    ageYears: 0,
    heightCm: 0,
    weightKg: 0,
    equationCoefficient: "male",
    goal: "maintain",
    activityLevel: "low",
    desiredWeightKg: null,
    preferredFoodIds: [],
    avoidedFoodIds: [],
    avoidedGroups: [],
    allergies: { status: "none_reported" },
    freeTextNote: null,
    pregnantOrLactating: null,
    therapeuticDietRequired: null,
    mealShares,
  };
}

function legacyPlan(input: MigrateProfileV1Input, planId: string): DietPlan {
  const meals: MealNutritionTarget[] = input.meals.map((meal) => ({
    mealKey: meal.mealKey,
    share: input.dailyCalories > 0 ? meal.calories / input.dailyCalories : 0,
    calories: meal.calories,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
  }));
  return {
    id: planId,
    personKey: input.personKey,
    origin: "legacy_inferred",
    policyId: "experimental-v1",
    assessment: legacyAssessment(input.personKey, input.meals, input.dailyCalories),
    catalogVersion: input.catalogVersion,
    createdAt: input.now.toISOString(),
    daily: {
      calories: input.dailyCalories,
      proteinGrams: 0,
      carbohydrateGrams: 0,
      fatGrams: 0,
    },
    meals,
  };
}

function readComplete(storage: ProfileStorage, personKey: PersonKey): boolean {
  try {
    const raw = storage.get(migrationFlagKey(personKey));
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { status?: string }).status === "complete"
    );
  } catch {
    return false;
  }
}

function entrySignature(profile: ProfileStoreV2): string {
  const lines: string[] = [];
  const days = [...profile.days].sort((left, right) => (left.date < right.date ? -1 : 1));
  for (const day of days) {
    for (const entry of day.entries) {
      lines.push(
        JSON.stringify({
          id: entry.id,
          date: entry.date,
          foodId: entry.foodId,
          grams: entry.grams,
          mealKey: entry.mealKey,
          nutrients: entry.nutrients,
          foodVersion: entry.foodVersion,
        }),
      );
    }
  }
  return lines.join("\n");
}

export function migrateProfileV1(input: MigrateProfileV1Input): MigrationResult {
  const v1Rows = captureV1(input.storage, input.personKey);
  if (!v1Rows) {
    return failure(
      [diagnostic("storage_failed", "Não foi possível ler as chaves v1 antes da migração.")],
      true,
    );
  }

  const loaded = loadProfile(input.storage, input.personKey);
  if (!loaded.ok && loaded.reason !== "missing") {
    return failure(
      [
        diagnostic(
          "v2_unreadable",
          "O envelope v2 existente não foi lido. Nada foi sobrescrito.",
        ),
        ...loaded.diagnostics,
      ],
      v1Unchanged(input.storage, v1Rows),
    );
  }

  const existing = loaded.ok ? loaded.profile : null;
  if (existing && readComplete(input.storage, input.personKey)) {
    return {
      ok: true,
      profile: existing,
      legacyPreserved: v1Unchanged(input.storage, v1Rows),
      diagnostics: [
        diagnostic("migration_already_complete", "A migração já estava concluída. Nenhum lançamento foi duplicado."),
      ],
    };
  }

  if (!Number.isFinite(input.dailyCalories) || input.dailyCalories <= 0) {
    return failure(
      [diagnostic("invalid_legacy_targets", "A meta calórica legada é inválida. O v2 não foi gravado.")],
      v1Unchanged(input.storage, v1Rows),
    );
  }

  const today = saoPauloCalendarDate(input.now);
  const planId = legacyPlanId(input.personKey);
  const plan = legacyPlan(input, planId);
  const diagnostics: Diagnostic[] = [
    diagnostic(
      "legacy_inferred",
      "Plano-base reconstruído com origem legacy_inferred. A configuração histórica exata não estava armazenada.",
    ),
    diagnostic(
      "legacy_biometrics_not_recovered",
      "Idade, peso, altura e coeficiente não foram recuperados. O questionário confirmado continua vazio.",
    ),
  ];

  const migratedByDay = new Map<string, LogEntryV2[]>();
  const seenIds = new Set<string>();
  for (const row of v1Rows) {
    const parsed = parseV1Entries(row.raw, input.now.toISOString());
    if (parsed.skipped > 0) {
      diagnostics.push(
        diagnostic(
          "legacy_entry_skipped",
          `${parsed.skipped} registro(s) ilegível(is) em ${row.day} foram mantidos na v1 e não entraram no v2.`,
        ),
      );
    }
    for (const entry of parsed.entries) {
      if (seenIds.has(entry.id)) {
        diagnostics.push(diagnostic("duplicate_legacy_id", `Id já visto na v1: ${entry.id}.`));
        continue;
      }
      seenIds.add(entry.id);
      const food = input.foodsById.get(entry.foodId);
      const log = toLogEntry(input.personKey, row.day, entry, food, planId, today);
      const bucket = migratedByDay.get(row.day) ?? [];
      bucket.push(log);
      migratedByDay.set(row.day, bucket);
      if (!food) {
        diagnostics.push(
          diagnostic(
            "missing_food",
            `Alimento ${entry.foodId} ausente no lançamento ${entry.id}. Nutrientes ficam desconhecidos.`,
          ),
        );
      } else if (
        log.nutrients.proteinGrams == null ||
        log.nutrients.carbohydrateGrams == null ||
        log.nutrients.fatGrams == null
      ) {
        diagnostics.push(
          diagnostic(
            "partial_nutrients",
            `Lançamento ${entry.id} tem macro desconhecido. Ele não foi convertido em zero.`,
          ),
        );
      }
    }
  }

  const migratedDays: ProfileDayState[] = [...migratedByDay.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([date, entries]) => ({
      date,
      entries,
      snapshot: makeDaySnapshot(plan, date, input.now.toISOString()),
    }));

  const days = mergeDays(existing?.days ?? [], migratedDays);
  const plans = [...(existing?.plans ?? []).filter((item) => item.id !== plan.id), plan];
  const hasLegacyActivation = (existing?.activations ?? []).some((item) => item.planId === plan.id);
  const legacyActivation: PlanActivation = {
    id: `legacy-inferred-activation:${input.personKey}`,
    personKey: input.personKey,
    planId: plan.id,
    effectiveDate: migratedDays[0]?.date ?? today,
    status: (existing?.activations ?? []).some((item) => item.status === "active")
      ? "superseded"
      : "active",
    createdAt: input.now.toISOString(),
  };
  const activations = hasLegacyActivation
    ? [...(existing?.activations ?? [])]
    : [...(existing?.activations ?? []), legacyActivation];

  const built: ProfileStoreV2 = {
    ...(existing ?? emptyProfile(input.personKey)),
    schemaVersion: 2,
    personKey: input.personKey,
    revision: existing?.revision ?? 0,
    draftAssessment: existing?.draftAssessment ?? null,
    confirmedAssessment: existing?.confirmedAssessment ?? null,
    plans,
    activations,
    days,
  };

  const issues = validateProfileStore(built);
  if (issues.length > 0) {
    return failure(
      [diagnostic("invalid_schema", "O envelope v2 foi rejeitado antes da primeira gravação."), ...issues],
      v1Unchanged(input.storage, v1Rows),
    );
  }

  const saved = saveProfile(input.storage, built);
  if (!saved.persisted) {
    return failure(
      [
        diagnostic("not_persisted", saved.message),
        diagnostic(saved.reason, "A migração não foi marcada como concluída."),
      ],
      v1Unchanged(input.storage, v1Rows),
    );
  }

  const reread = loadProfile(input.storage, input.personKey);
  const preserved = v1Unchanged(input.storage, v1Rows);
  if (!reread.ok || entrySignature(reread.profile) !== entrySignature(saved.profile)) {
    return failure(
      [diagnostic("integrity_failed", "A releitura do v2 não confere. A migração não foi concluída.")],
      preserved,
      reread.ok ? reread.profile : saved.profile,
    );
  }
  const origin = reread.profile.plans.find((item) => item.id === plan.id)?.origin;
  if (origin !== "legacy_inferred") {
    return failure(
      [diagnostic("integrity_failed", "O plano reconstruído perdeu a origem legacy_inferred.")],
      preserved,
      reread.profile,
    );
  }

  const flag = JSON.stringify({ status: "complete", revision: reread.profile.revision });
  try {
    input.storage.set(migrationFlagKey(input.personKey), flag);
    if (input.storage.get(migrationFlagKey(input.personKey)) !== flag) {
      return failure(
        [diagnostic("migration_flag_failed", "O v2 foi gravado, mas a conclusão da migração não.")],
        v1Unchanged(input.storage, v1Rows),
        reread.profile,
      );
    }
  } catch {
    return failure(
      [diagnostic("migration_flag_failed", "O v2 foi gravado, mas a conclusão da migração não.")],
      v1Unchanged(input.storage, v1Rows),
      reread.profile,
    );
  }

  return {
    ok: true,
    profile: reread.profile,
    legacyPreserved: v1Unchanged(input.storage, v1Rows),
    diagnostics,
  };
}

function mergeDays(
  existing: readonly ProfileDayState[],
  migrated: readonly ProfileDayState[],
): ProfileDayState[] {
  const byDate = new Map<string, ProfileDayState>();
  for (const day of existing) {
    byDate.set(day.date, {
      date: day.date,
      snapshot: day.snapshot,
      entries: day.entries.filter((entry) => entry.foodVersion !== MIGRATED_ESTIMATE_FOOD_VERSION),
    });
  }
  for (const day of migrated) {
    const current = byDate.get(day.date);
    if (!current) {
      byDate.set(day.date, day);
      continue;
    }
    const keptIds = new Set(current.entries.map((entry) => entry.id));
    byDate.set(day.date, {
      date: day.date,
      snapshot: current.snapshot?.frozenAt ? current.snapshot : day.snapshot,
      entries: [...current.entries, ...day.entries.filter((entry) => !keptIds.has(entry.id))],
    });
  }
  return [...byDate.values()]
    .filter((day) => day.entries.length > 0 || day.snapshot)
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}
