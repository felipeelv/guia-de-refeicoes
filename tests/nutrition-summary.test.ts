import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_TARGET_EXCEEDED_MESSAGE,
  DAY_TARGET_MET_MESSAGE,
  rebalanceRemainingMeals,
} from "../src/domain/nutrition/rebalance-targets.ts";
import {
  MACRO_TARGETS_NOT_CONFIGURED,
  macroTargetMessage,
  summarizeDay,
} from "../src/domain/nutrition/summarize-nutrition.ts";
import type {
  DayNutritionSummary,
  DayPlanSnapshot,
  DietPlan,
  FoodSource,
  LogEntryV2,
  MealKey,
  MealNutritionTarget,
  NutritionTargets,
} from "../src/domain/types.ts";

const MEALS: readonly MealKey[] = ["breakfast", "lunch", "snack", "dinner", "supper"];

const SOURCE: FoodSource = {
  name: "TBCA",
  code: "TESTE",
  accessedAt: "2026-09-26",
};

function meal(
  mealKey: MealKey,
  calories: number,
  share: number,
  protein = 20,
  carbohydrate = 40,
  fat = 10,
): MealNutritionTarget {
  return {
    mealKey,
    share,
    calories,
    proteinGrams: protein,
    carbohydrateGrams: carbohydrate,
    fatGrams: fat,
  };
}

function plan(origin: DietPlan["origin"], meals: readonly MealNutritionTarget[]): DietPlan {
  const daily = meals.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      proteinGrams: sum.proteinGrams + item.proteinGrams,
      carbohydrateGrams: sum.carbohydrateGrams + item.carbohydrateGrams,
      fatGrams: sum.fatGrams + item.fatGrams,
    }),
    { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 },
  );
  return {
    id: origin === "legacy_inferred" ? "legacy-inferred:felipe" : "plano-confirmado",
    personKey: "felipe",
    origin,
    policyId: "experimental-v1",
    assessment: {
      personKey: "felipe",
      ageYears: origin === "legacy_inferred" ? 0 : 35,
      heightCm: origin === "legacy_inferred" ? 0 : 180,
      weightKg: origin === "legacy_inferred" ? 0 : 80,
      equationCoefficient: "male",
      goal: "maintain",
      activityLevel: "moderate",
      desiredWeightKg: null,
      preferredFoodIds: [],
      avoidedFoodIds: [],
      avoidedGroups: [],
      allergies: { status: "none_reported" },
      freeTextNote: null,
      pregnantOrLactating: null,
      therapeuticDietRequired: null,
      mealShares: null,
    },
    catalogVersion: "test",
    createdAt: "2026-09-26T12:00:00.000Z",
    daily,
    meals,
  };
}

function snapshot(diet: DietPlan): DayPlanSnapshot {
  return {
    personKey: "felipe",
    date: "2026-09-26",
    plan: diet,
    baseDaily: diet.daily,
    baseMeals: diet.meals,
    frozenAt: "2026-09-26T15:00:00.000Z",
  };
}

function summary(
  partial: Pick<DayNutritionSummary, "balances" | "coverage" | "pendingMealKeys" | "macroTargetsConfigured"> &
    Partial<Pick<DayNutritionSummary, "consumed">>,
): DayNutritionSummary {
  return {
    personKey: "felipe",
    date: "2026-09-26",
    consumed: partial.consumed ?? {
      calories: 0,
      proteinGrams: 0,
      carbohydrateGrams: 0,
      fatGrams: 0,
    },
    balances: partial.balances,
    coverage: partial.coverage,
    pendingMealKeys: partial.pendingMealKeys,
    macroTargetsConfigured: partial.macroTargetsConfigured,
  };
}

function log(overrides: Partial<LogEntryV2> & Pick<LogEntryV2, "id" | "mealKey" | "nutrients">): LogEntryV2 {
  return {
    batchId: overrides.id,
    personKey: "felipe",
    date: "2026-09-26",
    foodId: "arroz",
    foodName: "Arroz",
    preparation: "cozido",
    grams: 100,
    units: null,
    source: SOURCE,
    foodVersion: "catalog",
    dayPlanId: "plano-confirmado",
    createdAt: "2026-09-26T15:00:00.000Z",
    ...overrides,
  };
}

function caloriesOf(result: ReturnType<typeof rebalanceRemainingMeals>, mealKey: MealKey): number {
  return result.mealTargets.find((meal) => meal.mealKey === mealKey)?.calories ?? Number.NaN;
}

test("perfil sem questionário não inventa meta de macros", () => {
  const legacy = plan("legacy_inferred", [
    meal("breakfast", 400, 0.2, 0, 0, 0),
    meal("lunch", 550, 0.275, 0, 0, 0),
    meal("snack", 300, 0.15, 0, 0, 0),
    meal("dinner", 550, 0.275, 0, 0, 0),
    meal("supper", 200, 0.1, 0, 0, 0),
  ]);
  const day = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    baseDaily: legacy.daily,
    mealKeys: MEALS,
    macroTargetsConfigured: false,
    entries: [
      log({
        id: "proteina",
        mealKey: "lunch",
        nutrients: { calories: 200, proteinGrams: 30, carbohydrateGrams: 10, fatGrams: 4 },
      }),
    ],
  });
  assert.equal(day.macroTargetsConfigured, false);
  assert.equal(macroTargetMessage(day), MACRO_TARGETS_NOT_CONFIGURED);
  assert.equal(day.balances.proteinGrams, null);
  assert.equal(day.balances.carbohydrateGrams, null);
  assert.equal(day.balances.fatGrams, null);
  assert.equal(day.consumed.proteinGrams, 30);
  assert.equal(day.balances.calories, legacy.daily.calories - 200);
  assert.equal(day.coverage, "complete");
});

test("total parcial soma só o que é conhecido e não fecha saldo de macro", () => {
  const day = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: { calories: 2000, proteinGrams: 100, carbohydrateGrams: 250, fatGrams: 60 },
    entries: [
      log({
        id: "conhecido",
        mealKey: "lunch",
        nutrients: { calories: 130, proteinGrams: 5, carbohydrateGrams: 28, fatGrams: 2 },
      }),
      log({
        id: "sem-gordura",
        mealKey: "snack",
        nutrients: { calories: 52, proteinGrams: 0.3, carbohydrateGrams: 14, fatGrams: null },
      }),
    ],
  });
  assert.equal(day.coverage, "partial");
  assert.equal(day.consumed.fatGrams, 2);
  assert.equal(day.consumed.proteinGrams, 5.3);
  assert.equal(day.consumed.calories, 182);
  assert.equal(day.balances.fatGrams, null);
  assert.equal(day.balances.calories, 2000 - 182);

  const diet = plan("confirmed", MEALS.map((mealKey) => meal(mealKey, 400, 0.2, 20, 40, 10)));
  const frozen = snapshot(diet);
  const before = structuredClone(frozen);
  const result = rebalanceRemainingMeals(frozen, day, "experimental-v1");
  assert.deepEqual(frozen, before);
  assert.equal(result.diagnostics.some((item) => item.code === "macro_rebalance_disabled"), true);
  assert.equal(caloriesOf(result, "lunch"), 400);
  assert.equal(result.mealTargets.find((item) => item.mealKey === "breakfast")?.proteinGrams, 20);
  assert.equal(result.mealTargets.find((item) => item.mealKey === "breakfast")?.fatGrams, 10);
  assert.notEqual(caloriesOf(result, "breakfast"), 400);
  assert.ok(result.mealTargets.every((item) => item.fatGrams >= 0 && item.proteinGrams >= 0));
});

test("energia desconhecida não vira saldo zero", () => {
  const day = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: { calories: 2000, proteinGrams: 100, carbohydrateGrams: 200, fatGrams: 50 },
    entries: [
      log({
        id: "sem-kcal",
        mealKey: "dinner",
        nutrients: { calories: null, proteinGrams: 8, carbohydrateGrams: 0, fatGrams: 1 },
      }),
    ],
  });
  assert.equal(Number.isFinite(day.balances.calories), false);
  assert.equal(day.consumed.calories, 0);
  const diet = plan("confirmed", [meal("breakfast", 400, 0.5), meal("dinner", 400, 0.5)]);
  const frozen = snapshot(diet);
  const result = rebalanceRemainingMeals(frozen, day, "experimental-v1");
  assert.equal(result.diagnostics.some((item) => item.code === "energy_coverage_partial"), true);
  assert.equal(caloriesOf(result, "breakfast"), 400);
  assert.equal(caloriesOf(result, "dinner"), 400);
});

test("saldo negativo de macro continua visível e não gera gramas negativas", () => {
  const meals = MEALS.map((mealKey) => meal(mealKey, 400, 0.2, 20, 50, 12));
  const diet = plan("confirmed", meals);
  const day = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: diet.daily,
    entries: [
      log({
        id: "excesso",
        mealKey: "lunch",
        nutrients: { calories: 700, proteinGrams: 140, carbohydrateGrams: 40, fatGrams: 20 },
      }),
    ],
  });
  assert.equal(day.balances.proteinGrams, diet.daily.proteinGrams - 140);
  assert.ok((day.balances.proteinGrams ?? 0) < 0);
  const frozen = snapshot(diet);
  const before = structuredClone(frozen);
  const result = rebalanceRemainingMeals(frozen, day, "experimental-v1");
  assert.deepEqual(frozen.baseMeals, before.baseMeals);
  assert.deepEqual(frozen.baseDaily, before.baseDaily);
  for (const item of result.mealTargets) {
    assert.ok(item.proteinGrams >= 0);
    assert.ok(item.carbohydrateGrams >= 0);
    assert.ok(item.fatGrams >= 0);
    assert.ok(item.calories >= 0);
    const base = meals.find((meal) => meal.mealKey === item.mealKey);
    assert.equal(item.proteinGrams, base?.proteinGrams);
  }
});

test("grampeia energia personalizada entre 50% e 150% e derrama o excedente", () => {
  const diet = plan("confirmed", [
    meal("breakfast", 100, 0.75, 10, 10, 5),
    meal("lunch", 550, 0, 10, 10, 5),
    meal("dinner", 400, 0.25, 10, 10, 5),
  ]);
  const frozen = snapshot(diet);
  const spilled = rebalanceRemainingMeals(
    frozen,
    summary({
      macroTargetsConfigured: true,
      coverage: "partial",
      pendingMealKeys: ["breakfast", "dinner"],
      balances: { calories: 400, proteinGrams: null, carbohydrateGrams: null, fatGrams: null },
    }),
    "experimental-v1",
  );
  assert.equal(caloriesOf(spilled, "breakfast"), 150);
  assert.equal(caloriesOf(spilled, "dinner"), 250);
  assert.equal(caloriesOf(spilled, "lunch"), 550);
  assert.equal(spilled.unallocatedCalories, 0);
  assert.equal(spilled.diagnostics.some((item) => item.code === "macro_rebalance_disabled"), true);

  const capped = plan("confirmed", [meal("breakfast", 100, 0.5), meal("snack", 100, 0.5)]);
  const blocked = rebalanceRemainingMeals(
    snapshot(capped),
    summary({
      macroTargetsConfigured: true,
      coverage: "complete",
      pendingMealKeys: ["breakfast", "snack"],
      balances: { calories: 400, proteinGrams: -4, carbohydrateGrams: 0, fatGrams: 8 },
    }),
    "experimental-v1",
  );
  assert.equal(caloriesOf(blocked, "breakfast"), 150);
  assert.equal(caloriesOf(blocked, "snack"), 150);
  assert.equal(blocked.unallocatedCalories, 100);
  assert.equal(blocked.diagnostics.some((item) => item.code === "energy_unallocated"), true);
  assert.ok(blocked.mealTargets.every((item) => item.proteinGrams >= 0 && item.fatGrams >= 0));

  const floored = rebalanceRemainingMeals(
    frozen,
    summary({
      macroTargetsConfigured: false,
      coverage: "complete",
      pendingMealKeys: ["breakfast", "dinner"],
      balances: { calories: 160, proteinGrams: null, carbohydrateGrams: null, fatGrams: null },
    }),
    "experimental-v1",
  );
  assert.equal(caloriesOf(floored, "breakfast"), 50);
  assert.equal(caloriesOf(floored, "dinner"), 110);
  assert.equal(floored.unallocatedCalories, 0);
  assert.equal(floored.diagnostics.some((item) => item.code === "rebalance_limited"), true);
  assert.equal(floored.diagnostics.some((item) => item.message === MACRO_TARGETS_NOT_CONFIGURED), true);
});

test("plano legado não aplica o grampo de 50% a 150%", () => {
  const diet = plan("legacy_inferred", [meal("breakfast", 100, 0.5, 0, 0, 0), meal("dinner", 100, 0.5, 0, 0, 0)]);
  const result = rebalanceRemainingMeals(
    snapshot(diet),
    summary({
      macroTargetsConfigured: false,
      coverage: "complete",
      pendingMealKeys: ["breakfast", "dinner"],
      balances: { calories: 400, proteinGrams: null, carbohydrateGrams: null, fatGrams: null },
    }),
    "experimental-v1",
  );
  assert.equal(caloriesOf(result, "breakfast"), 200);
  assert.equal(caloriesOf(result, "dinner"), 200);
  assert.equal(result.unallocatedCalories, 0);
  assert.equal(result.diagnostics.some((item) => item.code === "energy_unallocated"), false);
});

test("saldo de energia zerado ou negativo não zera refeição nem empurra dívida", () => {
  const diet = plan("confirmed", MEALS.map((mealKey) => meal(mealKey, 200, 0.2)));
  const met = rebalanceRemainingMeals(
    snapshot(diet),
    summary({
      macroTargetsConfigured: true,
      coverage: "complete",
      pendingMealKeys: ["breakfast", "snack", "dinner", "supper"],
      balances: { calories: 0, proteinGrams: 10, carbohydrateGrams: 10, fatGrams: 4 },
    }),
    "experimental-v1",
  );
  assert.equal(met.diagnostics.some((item) => item.message === DAY_TARGET_MET_MESSAGE), true);
  assert.equal(met.unallocatedCalories, 0);
  assert.ok(met.mealTargets.every((item) => item.calories === 200));
  assert.equal(JSON.stringify(met).includes("pular"), false);
  assert.equal("nextDayDebt" in met, false);

  const exceeded = rebalanceRemainingMeals(
    snapshot(diet),
    summary({
      macroTargetsConfigured: true,
      coverage: "complete",
      pendingMealKeys: ["breakfast", "dinner"],
      balances: { calories: -180, proteinGrams: 0, carbohydrateGrams: -5, fatGrams: 3 },
    }),
    "experimental-v1",
  );
  assert.equal(exceeded.diagnostics.some((item) => item.message === DAY_TARGET_EXCEEDED_MESSAGE), true);
  assert.equal(exceeded.unallocatedCalories, 0);
  assert.ok(exceeded.mealTargets.every((item) => item.calories === 200 && item.carbohydrateGrams >= 0));
  assert.equal("nextDayDebt" in exceeded, false);
});

test("a última exclusão devolve a refeição à redistribuição", () => {
  const diet = plan("confirmed", MEALS.map((mealKey) => meal(mealKey, 100, 0.2, 10, 20, 5)));
  const lunch: NutritionTargets = { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 };
  const withLunch = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: diet.daily,
    entries: [log({ id: "so-almoco", mealKey: "lunch", grams: 1, nutrients: lunch })],
  });
  assert.equal(withLunch.pendingMealKeys.includes("lunch"), false);
  const withMore = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: diet.daily,
    entries: [
      log({ id: "so-almoco", mealKey: "lunch", grams: 1, nutrients: lunch }),
      log({ id: "mais", mealKey: "lunch", grams: 2, nutrients: lunch }),
    ],
  });
  assert.equal(withMore.pendingMealKeys.includes("lunch"), false);
  const cleared = summarizeDay({
    personKey: "felipe",
    date: "2026-09-26",
    mealKeys: MEALS,
    macroTargetsConfigured: true,
    baseDaily: diet.daily,
    entries: [],
  });
  assert.deepEqual(cleared.pendingMealKeys, MEALS);

  const eaten = rebalanceRemainingMeals(snapshot(diet), withLunch, "experimental-v1");
  const removed = rebalanceRemainingMeals(snapshot(diet), cleared, "experimental-v1");
  assert.equal(caloriesOf(eaten, "breakfast"), 125);
  assert.equal(caloriesOf(eaten, "lunch"), 100);
  assert.equal(caloriesOf(removed, "breakfast"), 100);
  assert.equal(caloriesOf(removed, "lunch"), 100);
});
