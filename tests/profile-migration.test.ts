import assert from "node:assert/strict";
import test from "node:test";
import { personByKey } from "../src/catalog/persons.ts";
import {
  applyDayEntries,
  cancelScheduledActivation,
  confirmPlanActivation,
  discardUnconfirmedProposal,
  effectivePlan,
  restorePlanActivation,
} from "../src/diet/plan-activation.ts";
import {
  DIARY_RETENTION_DAYS,
  UNSAVED_DEVICE_MESSAGE,
  emptyProfile,
  loadProfile,
  profileStorageKey,
  retainDiaryDays,
  saveProfile,
  saoPauloCalendarDate,
  type ProfileStorage,
} from "../src/diet/profile-store.ts";
import {
  MIGRATED_ESTIMATE_FOOD_VERSION,
  legacyPlanId,
  migrateProfileV1,
  migrationFlagKey,
  type MigrationFood,
} from "../src/diet/migrate-v1.ts";
import { rebalanceRemainingMeals } from "../src/domain/nutrition/rebalance-targets.ts";
import { summarizeDay } from "../src/domain/nutrition/summarize-nutrition.ts";
import type {
  DietAssessment,
  DietPlan,
  FoodSource,
  LogEntryV2,
  MealKey,
  ProfileStoreV2,
} from "../src/domain/types.ts";

const SOURCE: FoodSource = {
  name: "TBCA",
  code: "TESTE",
  accessedAt: "2026-09-26",
};

class MemoryStorage implements ProfileStorage {
  private readonly values = new Map<string, string>();
  readonly sets: string[] = [];
  failSet = false;
  ignoreSet = false;
  tamper = false;

  constructor(initial?: Record<string, string>) {
    for (const [key, value] of Object.entries(initial ?? {})) this.values.set(key, value);
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    if (key.startsWith("meal-guide:v1:")) throw new Error(`escrita na v1: ${key}`);
    this.sets.push(key);
    if (this.failSet) throw new Error("quota");
    if (this.ignoreSet) return;
    this.values.set(key, this.tamper ? "{\"nope\":true}" : value);
  }

  keys(): string[] {
    return [...this.values.keys()];
  }
}

function food(partial: Partial<MigrationFood> & Pick<MigrationFood, "name">): MigrationFood {
  return {
    preparation: "cru",
    caloriesPer100g: 100,
    proteinPer100g: 1,
    carbohydratePer100g: 10,
    fatPer100g: 1,
    source: SOURCE,
    ...partial,
  };
}

function assessment(personKey: DietPlan["personKey"]): DietAssessment {
  return {
    personKey,
    ageYears: 35,
    heightCm: 180,
    weightKg: 80,
    equationCoefficient: "male",
    goal: "lose",
    activityLevel: "moderate",
    desiredWeightKg: null,
    preferredFoodIds: [],
    avoidedFoodIds: [],
    avoidedGroups: [],
    allergies: { status: "none_reported" },
    freeTextNote: null,
    pregnantOrLactating: false,
    therapeuticDietRequired: false,
    mealShares: null,
  };
}

function makePlan(id: string, calories = 2000): DietPlan {
  const portions = [
    ["breakfast", 400],
    ["lunch", 550],
    ["snack", 300],
    ["dinner", 550],
    ["supper", 200],
  ] as const;
  return {
    id,
    personKey: "felipe",
    origin: "confirmed",
    policyId: "experimental-v1",
    assessment: assessment("felipe"),
    catalogVersion: "test",
    createdAt: "2026-09-01T12:00:00.000Z",
    daily: { calories, proteinGrams: 100, carbohydrateGrams: 200, fatGrams: 60 },
    meals: portions.map(([mealKey, mealCalories]) => ({
      mealKey,
      share: mealCalories / calories,
      calories: mealCalories,
      proteinGrams: 20,
      carbohydrateGrams: 40,
      fatGrams: 12,
    })),
  };
}

function withActive(plan: DietPlan, date: string): ProfileStoreV2 {
  return {
    ...emptyProfile("felipe"),
    plans: [plan],
    activations: [
      {
        id: `active-${plan.id}`,
        personKey: "felipe",
        planId: plan.id,
        effectiveDate: date,
        status: "active",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
    ],
  };
}

function entry(id: string, date: string, mealKey: MealKey): LogEntryV2 {
  return {
    id,
    batchId: id,
    personKey: "felipe",
    date,
    mealKey,
    foodId: "arroz",
    foodName: "Arroz",
    preparation: "cozido",
    grams: 100,
    units: null,
    nutrients: { calories: 130, proteinGrams: 2, carbohydrateGrams: 28, fatGrams: 0.4 },
    source: SOURCE,
    foodVersion: "catalog",
    dayPlanId: "plano-a",
    createdAt: `${date}T15:00:00.000Z`,
  };
}

test("separa a data de America/Sao_Paulo da data UTC", () => {
  assert.equal(saoPauloCalendarDate(new Date("2026-09-27T02:30:00.000Z")), "2026-09-26");
  assert.equal(saoPauloCalendarDate(new Date("2026-09-27T03:30:00.000Z")), "2026-09-27");
});

test("migra a v1 uma vez, preserva ids e não transforma desconhecido em zero", () => {
  const felipe = personByKey("felipe");
  if (!felipe) throw new Error("Perfil felipe ausente.");
  const day = "2026-09-26";
  const v1Key = `meal-guide:v1:log:felipe:${day}`;
  const otherKey = "meal-guide:v1:log:gabriela:2026-09-26";
  const v1Raw = JSON.stringify([
    { id: "e-arroz", foodId: "arroz", grams: 250, mealKey: "lunch", createdAt: "2026-09-26T15:00:00.000Z" },
    { nope: true },
    { id: "e-maca", foodId: "maca", grams: 100, mealKey: "snack", createdAt: "2026-09-26T18:00:00.000Z" },
    { id: "e-oleo", foodId: "oleo", grams: 10, mealKey: "lunch", createdAt: "2026-09-26T15:05:00.000Z" },
    { id: "e-sumido", foodId: "sumido", grams: 80, mealKey: "dinner", createdAt: "2026-09-26T21:00:00.000Z" },
  ]);
  const otherRaw = JSON.stringify([
    { id: "e-gabriela", foodId: "arroz", grams: 40, mealKey: "breakfast", createdAt: "2026-09-26T10:00:00.000Z" },
  ]);
  const storage = new MemoryStorage({ [v1Key]: v1Raw, [otherKey]: otherRaw });
  const foods = new Map<string, MigrationFood>([
    ["arroz", food({ name: "Arroz", caloriesPer100g: 130, proteinPer100g: 2.5, carbohydratePer100g: 28, fatPer100g: 0.4 })],
    ["maca", food({ name: "Maçã", caloriesPer100g: 52, proteinPer100g: 0.3, carbohydratePer100g: 14, fatPer100g: null })],
    ["oleo", food({ name: "Óleo", caloriesPer100g: 884, proteinPer100g: 0, carbohydratePer100g: 0, fatPer100g: 0 })],
  ]);
  const input = {
    storage,
    personKey: "felipe" as const,
    now: new Date("2026-09-27T15:00:00.000Z"),
    foodsById: foods,
    dailyCalories: felipe.dailyCalories,
    meals: felipe.meals.map((meal) => ({ mealKey: meal.key, calories: meal.targetCalories })),
    catalogVersion: "legacy-test",
  };

  const first = migrateProfileV1(input);
  assert.equal(first.ok, true);
  assert.equal(first.legacyPreserved, true);
  assert.equal(storage.get(v1Key), v1Raw);
  assert.equal(storage.get(otherKey), otherRaw);
  assert.ok(first.profile);
  assert.equal(first.profile.confirmedAssessment, null);
  assert.equal(first.profile.personKey, "felipe");
  const plan = first.profile.plans.find((item) => item.id === legacyPlanId("felipe"));
  assert.ok(plan);
  assert.equal(plan.origin, "legacy_inferred");
  assert.equal(plan.daily.calories, felipe.dailyCalories);
  assert.equal(plan.daily.proteinGrams, 0);
  assert.equal(plan.assessment.ageYears, 0);
  assert.equal(plan.assessment.heightCm, 0);
  assert.equal(plan.assessment.weightKg, 0);

  const entries = first.profile.days.flatMap((item) => item.entries);
  assert.deepEqual(
    entries.map((item) => item.id),
    ["e-arroz", "e-maca", "e-oleo", "e-sumido"],
  );
  const arroz = entries.find((item) => item.id === "e-arroz");
  const maca = entries.find((item) => item.id === "e-maca");
  const oleo = entries.find((item) => item.id === "e-oleo");
  const missing = entries.find((item) => item.id === "e-sumido");
  assert.ok(arroz && maca && oleo && missing);
  assert.equal(arroz.grams, 250);
  assert.equal(arroz.date, day);
  assert.equal(arroz.foodId, "arroz");
  assert.equal(arroz.foodVersion, MIGRATED_ESTIMATE_FOOD_VERSION);
  assert.equal(arroz.nutrients.calories, 325);
  assert.equal(arroz.nutrients.proteinGrams, 6.25);
  assert.equal(arroz.nutrients.fatGrams, 1);
  assert.equal(maca.nutrients.fatGrams, null);
  assert.equal(maca.nutrients.calories, 52);
  assert.equal(oleo.nutrients.fatGrams, 0);
  assert.equal(missing.grams, 80);
  assert.deepEqual(missing.nutrients, {
    calories: null,
    proteinGrams: null,
    carbohydrateGrams: null,
    fatGrams: null,
  });
  assert.equal(entries.some((item) => item.id === "e-gabriela"), false);
  assert.equal(storage.sets.some((key) => key.startsWith("meal-guide:v1:")), false);
  assert.equal(first.profile.days[0]?.snapshot?.frozenAt, "2026-09-27T15:00:00.000Z");

  const writes = storage.sets.length;
  const second = migrateProfileV1(input);
  assert.equal(second.ok, true);
  assert.equal(second.legacyPreserved, true);
  assert.equal(storage.sets.length, writes);
  assert.equal(storage.get(v1Key), v1Raw);
  assert.deepEqual(
    second.profile?.days.flatMap((item) => item.entries).map((item) => item.id),
    entries.map((item) => item.id),
  );
  assert.equal(second.profile?.revision, first.profile.revision);
  const flag = storage.get(migrationFlagKey("felipe"));
  assert.ok(flag);
  assert.equal(JSON.parse(flag).status, "complete");
});

test("não grava v2 nem conclui a migração quando a releitura não confere", () => {
  const storage = new MemoryStorage({
    "meal-guide:v1:log:felipe:2026-09-26": JSON.stringify([
      { id: "e1", foodId: "arroz", grams: 50, mealKey: "lunch", createdAt: "2026-09-26T15:00:00.000Z" },
    ]),
  });
  storage.tamper = true;
  const result = migrateProfileV1({
    storage,
    personKey: "felipe",
    now: new Date("2026-09-27T15:00:00.000Z"),
    foodsById: new Map([["arroz", food({ name: "Arroz" })]]),
    dailyCalories: 2000,
    meals: [{ mealKey: "lunch", calories: 2000 }],
    catalogVersion: "test",
  });
  assert.equal(result.ok, false);
  assert.equal(result.legacyPreserved, true);
  assert.equal(storage.get(migrationFlagKey("felipe")), null);
  assert.ok(storage.get("meal-guide:v1:log:felipe:2026-09-26")?.includes("e1"));
});

test("rejeita meta inválida antes da primeira gravação v2", () => {
  const storage = new MemoryStorage({
    "meal-guide:v1:log:kelly:2026-09-26": JSON.stringify([
      { id: "k1", foodId: "arroz", grams: 30, mealKey: "snack", createdAt: "2026-09-26T15:00:00.000Z" },
    ]),
  });
  const result = migrateProfileV1({
    storage,
    personKey: "kelly",
    now: new Date("2026-09-27T15:00:00.000Z"),
    foodsById: new Map(),
    dailyCalories: Number.NaN,
    meals: [{ mealKey: "snack", calories: 100 }],
    catalogVersion: "test",
  });
  assert.equal(result.ok, false);
  assert.equal(result.profile, null);
  assert.equal(storage.get(profileStorageKey("kelly")), null);
  assert.equal(storage.sets.length, 0);
});

test("falha de gravação não confirma persistência e revisão mais nova bloqueia a outra aba", () => {
  const storage = new MemoryStorage();
  const created = saveProfile(storage, emptyProfile("felipe"));
  assert.equal(created.persisted, true);
  if (!created.persisted) return;
  const stored = storage.get(profileStorageKey("felipe"));

  storage.failSet = true;
  const failed = saveProfile(storage, created.profile);
  assert.equal(failed.persisted, false);
  if (failed.persisted) return;
  assert.equal(failed.message, UNSAVED_DEVICE_MESSAGE);
  assert.equal(failed.reason, "storage_failed");
  assert.equal(failed.profile.revision, created.profile.revision);
  assert.equal(storage.get(profileStorageKey("felipe")), stored);

  storage.failSet = false;
  storage.ignoreSet = true;
  const ignored = saveProfile(storage, created.profile);
  assert.equal(ignored.persisted, false);
  if (ignored.persisted) return;
  assert.equal(ignored.message, UNSAVED_DEVICE_MESSAGE);
  assert.equal(storage.get(profileStorageKey("felipe")), stored);

  storage.ignoreSet = false;
  const tabA = saveProfile(storage, created.profile);
  assert.equal(tabA.persisted, true);
  const tabB = saveProfile(storage, created.profile);
  assert.equal(tabB.persisted, false);
  if (tabB.persisted || !tabA.persisted) return;
  assert.equal(tabB.reason, "revision_conflict");
  assert.equal(tabB.message, UNSAVED_DEVICE_MESSAGE);
  assert.equal(storage.get(profileStorageKey("felipe")), JSON.stringify(tabA.profile));
  assert.equal(loadProfile(storage, "gabriela").ok, false);
});

test("o descarte de sete dias não apaga plano ativo nem agendado", () => {
  const active = makePlan("plano-antigo");
  const scheduled = makePlan("plano-futuro");
  const profile: ProfileStoreV2 = {
    ...emptyProfile("felipe"),
    plans: [active, scheduled],
    activations: [
      {
        id: "vigente",
        personKey: "felipe",
        planId: active.id,
        effectiveDate: "2026-01-01",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "agendado",
        personKey: "felipe",
        planId: scheduled.id,
        effectiveDate: "2026-10-15",
        status: "scheduled",
        createdAt: "2026-09-27T12:00:00.000Z",
      },
    ],
    days: [
      { date: "2026-09-19", snapshot: null, entries: [] },
      { date: "2026-09-20", snapshot: null, entries: [] },
      { date: "2026-09-27", snapshot: null, entries: [] },
    ],
  };
  const retained = retainDiaryDays(profile, "2026-09-27");
  assert.equal(DIARY_RETENTION_DAYS, 7);
  assert.deepEqual(retained.days.map((day) => day.date), ["2026-09-20", "2026-09-27"]);
  assert.deepEqual(retained.plans.map((plan) => plan.id), ["plano-antigo", "plano-futuro"]);
  assert.deepEqual(
    retained.activations.map((activation) => [activation.id, activation.status]),
    [
      ["vigente", "active"],
      ["agendado", "scheduled"],
    ],
  );
});

test("aplica na hora sem consumo e só no dia seguinte quando já há lançamento", () => {
  const evening = new Date("2026-09-27T02:30:00.000Z");
  assert.equal(saoPauloCalendarDate(evening), "2026-09-26");
  const planA = makePlan("plano-a");
  const planB = makePlan("plano-b");
  const open = {
    ...withActive(planA, "2026-09-01"),
    plans: [planA, planB],
  };
  const discarded = discardUnconfirmedProposal(open);
  assert.equal(discarded.confirmed, false);
  assert.deepEqual(discarded.profile, open);
  const missing = confirmPlanActivation(open, "nao-existe", evening, "ativacao-erro");
  assert.equal(missing.confirmed, false);
  assert.deepEqual(missing.profile.activations, open.activations);

  const immediate = confirmPlanActivation(open, planB.id, evening, "ativacao-b");
  assert.equal(immediate.confirmed, true);
  assert.equal(immediate.immediate, true);
  assert.equal(immediate.effectiveDate, "2026-09-26");
  assert.equal(immediate.activation?.status, "active");
  assert.equal(effectivePlan(immediate.profile, "2026-09-26")?.id, planB.id);
  assert.equal(immediate.profile.days.find((day) => day.date === "2026-09-26")?.snapshot?.frozenAt, null);
  assert.equal(immediate.profile.days.find((day) => day.date === "2026-09-26")?.snapshot?.plan.id, planB.id);

  const consumed: ProfileStoreV2 = {
    ...open,
    days: [
      {
        date: "2026-09-26",
        snapshot: null,
        entries: [entry("almoco", "2026-09-26", "lunch")],
      },
    ],
  };
  const scheduled = confirmPlanActivation(consumed, planB.id, evening, "ativacao-amanha");
  assert.equal(scheduled.immediate, false);
  assert.equal(scheduled.effectiveDate, "2026-09-27");
  assert.equal(scheduled.activation?.status, "scheduled");
  assert.equal(effectivePlan(scheduled.profile, "2026-09-26")?.id, planA.id);
  assert.equal(effectivePlan(scheduled.profile, "2026-09-27")?.id, planB.id);
  assert.equal(
    scheduled.profile.activations.find((activation) => activation.planId === planA.id)?.status,
    "active",
  );
});

test("cancela ou substitui o agendado e congela a cópia no primeiro consumo", () => {
  const planA = makePlan("plano-a");
  const planB = makePlan("plano-b");
  const planC = makePlan("plano-c");
  const now = new Date("2026-09-26T18:00:00.000Z");
  const today = saoPauloCalendarDate(now);
  let profile: ProfileStoreV2 = {
    ...withActive(planA, "2026-09-01"),
    plans: [planA, planB, planC],
    days: [{ date: today, snapshot: null, entries: [entry("almoco", today, "lunch")] }],
  };
  const first = confirmPlanActivation(profile, planB.id, now, "agendado-b");
  assert.equal(first.effectiveDate, "2026-09-27");
  const replaced = confirmPlanActivation(first.profile, planC.id, now, "agendado-c");
  assert.equal(replaced.activation?.status, "scheduled");
  assert.equal(replaced.effectiveDate, "2026-09-27");
  assert.equal(
    replaced.profile.activations.find((activation) => activation.id === "agendado-b")?.status,
    "superseded",
  );
  assert.equal(
    replaced.profile.activations.find((activation) => activation.id === "active-plano-a")?.status,
    "active",
  );
  const cancelled = cancelScheduledActivation(replaced.profile, "agendado-c", now);
  assert.equal(cancelled.profile.activations.find((activation) => activation.id === "agendado-c")?.status, "cancelled");
  assert.equal(effectivePlan(cancelled.profile, today)?.id, planA.id);

  const opened = confirmPlanActivation(
    { ...withActive(planA, "2026-09-01"), plans: [planA, planB, planC] },
    planB.id,
    now,
    "ja",
  );
  assert.equal(opened.profile.days[0]?.snapshot?.plan.id, planB.id);
  assert.equal(opened.profile.days[0]?.snapshot?.frozenAt, null);
  const frozen = applyDayEntries(opened.profile, today, [entry("cafe", today, "breakfast")], now);
  const snapshot = frozen.days[0]?.snapshot;
  assert.ok(snapshot?.frozenAt);
  assert.equal(snapshot?.plan.id, planB.id);
  const bases = snapshot?.baseMeals.map((meal) => meal.calories);
  const withAnother = applyDayEntries(
    frozen,
    today,
    [entry("cafe", today, "breakfast"), entry("almoco-2", today, "lunch")],
    now,
  );
  assert.deepEqual(withAnother.days[0]?.snapshot?.baseMeals.map((meal) => meal.calories), bases);
  assert.equal(withAnother.days[0]?.entries.length, 2);
  const blocked = confirmPlanActivation(withAnother, planC.id, now, "meio-dia");
  assert.equal(blocked.effectiveDate, "2026-09-27");
  assert.equal(blocked.profile.days.find((day) => day.date === today)?.snapshot?.plan.id, planB.id);
  assert.deepEqual(
    blocked.profile.days.find((day) => day.date === today)?.snapshot?.baseMeals.map((meal) => meal.calories),
    bases,
  );

  const summary = summarizeDay({
    personKey: "felipe",
    date: today,
    entries: withAnother.days[0]?.entries ?? [],
    baseDaily: snapshot?.baseDaily ?? planB.daily,
    mealKeys: planB.meals.map((meal) => meal.mealKey),
    macroTargetsConfigured: true,
  });
  const before = structuredClone(withAnother.days[0]?.snapshot);
  const rebalanced = rebalanceRemainingMeals(withAnother.days[0]!.snapshot!, summary, "experimental-v1");
  assert.deepEqual(withAnother.days[0]?.snapshot, before);
  assert.ok(rebalanced.mealTargets.every((meal) => meal.calories >= 0 && meal.proteinGrams >= 0));
  assert.deepEqual(before?.baseMeals, withAnother.days[0]?.snapshot?.baseMeals);
});

test("restaurar cria outra vigência e não reescreve o dia congelado", () => {
  const planA = makePlan("plano-a");
  const now = new Date("2026-09-26T18:00:00.000Z");
  const today = "2026-09-26";
  const opened = confirmPlanActivation(withActive(planA, "2026-09-01"), planA.id, now, "original");
  const frozen = applyDayEntries(opened.profile, today, [entry("jantar", today, "dinner")], now);
  const past = frozen.days.find((day) => day.date === today);
  assert.ok(past?.snapshot?.frozenAt);
  const nextDay = new Date("2026-09-27T15:00:00.000Z");
  const restored = restorePlanActivation(frozen, planA.id, nextDay, "restaurado");
  assert.equal(restored.confirmed, true);
  assert.equal(restored.immediate, true);
  assert.equal(restored.effectiveDate, "2026-09-27");
  assert.notEqual(restored.activation?.id, "original");
  const still = restored.profile.days.find((day) => day.date === today);
  assert.equal(still?.snapshot?.frozenAt, past?.snapshot?.frozenAt);
  assert.equal(still?.snapshot?.plan.id, planA.id);
  assert.deepEqual(still?.snapshot?.baseDaily, past?.snapshot?.baseDaily);
  assert.equal(still?.entries[0]?.id, "jantar");
  assert.equal(restored.profile.days.find((day) => day.date === "2026-09-27")?.snapshot?.frozenAt, null);
});
