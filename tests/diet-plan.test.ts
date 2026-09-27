import assert from "node:assert/strict";
import test from "node:test";
import { PERSONS } from "../src/catalog/persons.ts";
import { createDietProposal } from "../src/domain/nutrition/create-diet-plan.ts";
import {
  distributeDisplayIntegers,
  distributeTargets,
} from "../src/domain/nutrition/distribute-targets.ts";
import { validateDietPlan } from "../src/domain/nutrition/nutrition-validation.ts";
import {
  FALLBACK_MEAL_SHARES,
  experimentalV1Policy,
} from "../src/domain/nutrition/policy.ts";
import type { DietAssessment, DietPlan, MealKey } from "../src/domain/types.ts";

const policy = experimentalV1Policy;

function assessment(overrides: Partial<DietAssessment> = {}): DietAssessment {
  return {
    personKey: "felipe",
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
    ...overrides,
  };
}

function mealCalories(personKey: DietAssessment["personKey"]): number[] {
  const person = PERSONS.find((item) => item.key === personKey);
  assert.ok(person);
  return person.meals.map((meal) => meal.targetCalories);
}

test("metas das refeições somam a meta diária e usam o mesmo peso", () => {
  const kelly = PERSONS.find((person) => person.key === "kelly");
  assert.ok(kelly);
  const legacyBefore = kelly.meals.map((meal) => meal.targetCalories);
  const proposal = createDietProposal(assessment(), policy, kelly.meals);
  assert.deepEqual(
    kelly.meals.map((meal) => meal.targetCalories),
    legacyBefore,
  );
  assert.deepEqual(legacyBefore, [260, 355, 200, 355, 130]);

  assert.ok(proposal.daily);
  const daily = proposal.daily;
  assert.equal(proposal.meals.length, 5);
  const keys: MealKey[] = ["breakfast", "lunch", "snack", "dinner", "supper"];
  assert.deepEqual(
    proposal.meals.map((meal) => meal.mealKey),
    keys,
  );

  const shareSum = proposal.meals.reduce((sum, meal) => sum + meal.share, 0);
  assert.equal(shareSum, 1);
  assert.equal(
    proposal.meals.reduce((sum, meal) => sum + meal.calories, 0),
    daily.calories,
  );
  assert.equal(
    proposal.meals.reduce((sum, meal) => sum + meal.proteinGrams, 0),
    daily.proteinGrams,
  );
  assert.equal(
    proposal.meals.reduce((sum, meal) => sum + meal.carbohydrateGrams, 0),
    daily.carbohydrateGrams,
  );
  assert.equal(
    proposal.meals.reduce((sum, meal) => sum + meal.fatGrams, 0),
    daily.fatGrams,
  );

  const lunch = proposal.meals.find((meal) => meal.mealKey === "lunch");
  assert.ok(lunch);
  assert.equal(lunch.share, 355 / 1300);
  for (const meal of proposal.meals) {
    const weight = meal.calories / daily.calories;
    assert.ok(Math.abs(meal.proteinGrams / daily.proteinGrams - weight) < 1e-9);
    assert.ok(
      Math.abs(meal.carbohydrateGrams / daily.carbohydrateGrams - weight) < 1e-9,
    );
    assert.ok(Math.abs(meal.fatGrams / daily.fatGrams - weight) < 1e-9);
  }

  const plan: DietPlan = {
    id: "proposta-1",
    personKey: "felipe",
    origin: "confirmed",
    policyId: proposal.policyId,
    assessment: assessment(),
    catalogVersion: "test",
    createdAt: "2026-09-27T00:00:00.000Z",
    daily,
    meals: proposal.meals,
  };
  assert.deepEqual(validateDietPlan(plan), { valid: true, issues: [] });
});

test("distribuição inválida cai no fallback da política", () => {
  const proposal = createDietProposal(assessment(), policy, [
    { key: "breakfast", targetCalories: 0 },
    { key: "lunch", targetCalories: 500 },
  ]);
  assert.ok(proposal.daily);
  const byKey = Object.fromEntries(
    proposal.meals.map((meal) => [meal.mealKey, meal]),
  );
  assert.equal(byKey.breakfast?.share, FALLBACK_MEAL_SHARES.breakfast);
  assert.equal(byKey.lunch?.share, FALLBACK_MEAL_SHARES.lunch);
  assert.equal(byKey.snack?.share, FALLBACK_MEAL_SHARES.snack);
  assert.equal(byKey.dinner?.share, FALLBACK_MEAL_SHARES.dinner);
  assert.equal(proposal.meals.reduce((sum, meal) => sum + meal.share, 0), 1);
  assert.equal(
    proposal.meals.reduce((sum, meal) => sum + meal.calories, 0),
    proposal.daily.calories,
  );
  assert.equal(byKey.breakfast?.calories, 2310 * 0.2);
  assert.equal(byKey.lunch?.calories, 2310 * 0.275);
});

test("as mesmas entradas e a mesma política produzem o mesmo plano", () => {
  const body = assessment({ mealShares: null });
  const base = PERSONS[2]?.meals ?? [];
  const first = createDietProposal(body, policy, base);
  const second = createDietProposal(body, policy, base);
  assert.equal(first.policyId, "experimental-v1");
  assert.equal(second.policyId, policy.id);
  assert.deepEqual(first, second);
  assert.deepEqual(mealCalories("felipe"), [400, 550, 300, 550, 200]);
  assert.deepEqual(mealCalories("gabriela"), [240, 330, 180, 330, 120]);
  assert.deepEqual(mealCalories("kelly"), [260, 355, 200, 355, 130]);
  assert.deepEqual(
    PERSONS.map((person) => person.dailyCalories),
    [2000, 1200, 1300],
  );
});

test("inteiros de exibição distribuem o resíduo sem mudar o total interno", () => {
  const internal = [144.375, 259.875, 77];
  const snapshot = [...internal];
  const displayed = distributeDisplayIntegers(internal);
  assert.deepEqual(internal, snapshot);
  assert.deepEqual(displayed, [144, 260, 77]);
  assert.equal(
    displayed.reduce((sum, value) => sum + value, 0),
    Math.round(internal.reduce((sum, value) => sum + value, 0)),
  );
  assert.deepEqual(distributeDisplayIntegers([1.5, 1.5]), [2, 1]);
  assert.deepEqual(distributeDisplayIntegers([1.5, 1.5]), distributeDisplayIntegers([1.5, 1.5]));

  const proposal = createDietProposal(assessment(), policy, []);
  assert.ok(proposal.daily);
  const mealCalories = proposal.meals.map((meal) => meal.calories);
  const shown = distributeDisplayIntegers(mealCalories);
  assert.equal(
    shown.reduce((sum, value) => sum + value, 0),
    Math.round(mealCalories.reduce((sum, value) => sum + value, 0)),
  );
  assert.equal(proposal.daily.proteinGrams, 144.375);
  assert.equal(proposal.daily.carbohydrateGrams, 259.875);
  assert.equal(proposal.daily.fatGrams, 77);
});

test("validateDietPlan recusa plano incoerente ou com refeições incompletas", () => {
  const proposal = createDietProposal(assessment(), policy, []);
  assert.ok(proposal.daily);
  const valid: DietPlan = {
    id: "proposta-2",
    personKey: "felipe",
    origin: "confirmed",
    policyId: "experimental-v1",
    assessment: assessment(),
    catalogVersion: "test",
    createdAt: "2026-09-27T00:00:00.000Z",
    daily: proposal.daily,
    meals: proposal.meals,
  };
  assert.equal(validateDietPlan(valid).valid, true);

  const roundedProtein: DietPlan = {
    ...valid,
    daily: { ...valid.daily, proteinGrams: 144 },
  };
  const incoherent = validateDietPlan(roundedProtein);
  assert.equal(incoherent.valid, false);
  assert.equal(
    incoherent.issues.some((item) => item.code === "incoherent_energy"),
    true,
  );

  const fourMeals = validateDietPlan({
    ...valid,
    meals: valid.meals.slice(0, 4),
  });
  assert.equal(fourMeals.valid, false);
  assert.equal(fourMeals.issues.some((item) => item.code === "meal_count"), true);

  const shifted = distributeTargets(valid.daily, {
    breakfast: 0.5,
    lunch: 0.2,
    snack: 0.1,
    dinner: 0.1,
    supper: 0.1,
  });
  const custom = validateDietPlan({ ...valid, meals: shifted });
  assert.equal(custom.valid, true);
  assert.equal(
    shifted.reduce((sum, meal) => sum + meal.calories, 0),
    valid.daily.calories,
  );
});
