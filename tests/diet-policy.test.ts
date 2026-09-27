import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_FACTORS,
  COHERENCE_EPSILON_KCAL,
  DIAGNOSTIC_ENERGY_FLOOR_APPLIED,
  DIAGNOSTIC_GOAL_CONFLICT,
  DIAGNOSTIC_UNSUPPORTED_ENERGY_RANGE,
  DIAGNOSTIC_UNSUPPORTED_PROFILE,
  ENERGY_CEILING_KCAL,
  ENERGY_FLOOR_KCAL,
  ENERGY_TARGET_STEP_KCAL,
  FALLBACK_MEAL_SHARES,
  GOAL_MULTIPLIERS,
  INPUT_BOUNDS,
  KCAL_PER_GRAM,
  MACRO_PRESETS,
  MIFFLIN_ST_JEOR,
  POLICY_VERSION,
  PORTION_TOLERANCES,
  SOLVER_COST_WEIGHTS,
  experimentalV1Policy,
  portionTolerance,
  roundEnergyTargetKcal,
  solverCost,
} from "../src/domain/nutrition/policy.ts";
import {
  PORTION_SOLUTION_STATES,
  type CalculationPolicyId,
  type DietDiagnosticCode,
  type PortionSolutionState,
} from "../src/domain/types.ts";

test("publica a política experimental-v1 e os códigos de diagnóstico", () => {
  const version: CalculationPolicyId = POLICY_VERSION;
  assert.equal(version, "experimental-v1");
  assert.equal(experimentalV1Policy.id, POLICY_VERSION);

  const energyFloorApplied: DietDiagnosticCode = DIAGNOSTIC_ENERGY_FLOOR_APPLIED;
  const goalConflict: DietDiagnosticCode = DIAGNOSTIC_GOAL_CONFLICT;
  const unsupportedEnergyRange: DietDiagnosticCode =
    DIAGNOSTIC_UNSUPPORTED_ENERGY_RANGE;
  const unsupportedProfile: DietDiagnosticCode = DIAGNOSTIC_UNSUPPORTED_PROFILE;
  assert.equal(energyFloorApplied, "energy_floor_applied");
  assert.equal(goalConflict, "goal_conflict");
  assert.equal(unsupportedEnergyRange, "unsupported_energy_range");
  assert.equal(unsupportedProfile, "unsupported_profile");
  assert.equal(
    experimentalV1Policy.diagnostics.energyFloorApplied,
    energyFloorApplied,
  );
  assert.equal(experimentalV1Policy.diagnostics.goalConflict, goalConflict);
  assert.equal(
    experimentalV1Policy.diagnostics.unsupportedEnergyRange,
    unsupportedEnergyRange,
  );
  assert.equal(
    experimentalV1Policy.diagnostics.unsupportedProfile,
    unsupportedProfile,
  );
});

test("fixa Mifflin, atividade, objetivo, pisos e teto sem clamp silencioso", () => {
  assert.equal(MIFFLIN_ST_JEOR.weightPerKg, 10);
  assert.equal(MIFFLIN_ST_JEOR.heightPerCm, 6.25);
  assert.equal(MIFFLIN_ST_JEOR.agePerYear, -5);
  assert.equal(MIFFLIN_ST_JEOR.maleIntercept, 5);
  assert.equal(MIFFLIN_ST_JEOR.femaleIntercept, -161);

  assert.equal(ACTIVITY_FACTORS.low, 1.2);
  assert.equal(ACTIVITY_FACTORS.light, 1.375);
  assert.equal(ACTIVITY_FACTORS.moderate, 1.55);
  assert.equal(ACTIVITY_FACTORS.high, 1.725);

  assert.equal(GOAL_MULTIPLIERS.maintain, 1);
  assert.equal(GOAL_MULTIPLIERS.lose, 0.85);
  assert.equal(GOAL_MULTIPLIERS.gain, 1.1);

  assert.equal(ENERGY_TARGET_STEP_KCAL, 10);
  assert.equal(ENERGY_FLOOR_KCAL.female, 1200);
  assert.equal(ENERGY_FLOOR_KCAL.male, 1500);
  assert.equal(ENERGY_CEILING_KCAL, 5000);
  assert.equal(roundEnergyTargetKcal(2315), 2320);
  assert.equal(roundEnergyTargetKcal(2304), 2300);
});

test("presets de macros somam 100% e os fatores são 4, 4 e 9", () => {
  assert.deepEqual(MACRO_PRESETS.maintain, {
    carbohydrate: 50,
    protein: 20,
    fat: 30,
  });
  assert.deepEqual(MACRO_PRESETS.lose, {
    carbohydrate: 45,
    protein: 25,
    fat: 30,
  });
  assert.deepEqual(MACRO_PRESETS.gain, {
    carbohydrate: 50,
    protein: 25,
    fat: 25,
  });
  for (const preset of Object.values(MACRO_PRESETS)) {
    assert.equal(preset.carbohydrate + preset.protein + preset.fat, 100);
  }
  assert.equal(KCAL_PER_GRAM.carbohydrate, 4);
  assert.equal(KCAL_PER_GRAM.protein, 4);
  assert.equal(KCAL_PER_GRAM.fat, 9);
  assert.equal(COHERENCE_EPSILON_KCAL, 0.01);
});

test("limites de entrada e fallback das refeições somam 1", () => {
  assert.deepEqual(INPUT_BOUNDS.ageYears, { min: 18, max: 80 });
  assert.deepEqual(INPUT_BOUNDS.heightCm, { min: 120, max: 230 });
  assert.deepEqual(INPUT_BOUNDS.weightKg, { min: 35, max: 250 });

  assert.equal(FALLBACK_MEAL_SHARES.breakfast, 0.2);
  assert.equal(FALLBACK_MEAL_SHARES.lunch, 0.275);
  assert.equal(FALLBACK_MEAL_SHARES.snack, 0.15);
  assert.equal(FALLBACK_MEAL_SHARES.dinner, 0.275);
  assert.equal(FALLBACK_MEAL_SHARES.supper, 0.1);
  const shareSum = Object.values(FALLBACK_MEAL_SHARES).reduce(
    (sum, share) => sum + share,
    0,
  );
  assert.equal(shareSum, 1);
});

test("tolerâncias da seção 10.4 e custo quadrático do solver", () => {
  assert.deepEqual(PORTION_TOLERANCES.energy, { absolute: 20, relative: 0.05 });
  assert.deepEqual(PORTION_TOLERANCES.protein, { absolute: 3, relative: 0.1 });
  assert.deepEqual(PORTION_TOLERANCES.carbohydrate, {
    absolute: 5,
    relative: 0.1,
  });
  assert.deepEqual(PORTION_TOLERANCES.fat, { absolute: 2, relative: 0.15 });

  assert.equal(portionTolerance("energy", 100), 20);
  assert.equal(portionTolerance("energy", 1000), 50);
  assert.equal(portionTolerance("protein", 10), 3);
  assert.equal(portionTolerance("protein", 100), 10);
  assert.equal(portionTolerance("carbohydrate", 20), 5);
  assert.equal(portionTolerance("carbohydrate", 200), 20);
  assert.equal(portionTolerance("fat", 10), 2);
  assert.equal(portionTolerance("fat", 100), 15);

  assert.equal(SOLVER_COST_WEIGHTS.energy, 2);
  assert.equal(SOLVER_COST_WEIGHTS.protein, 1);
  assert.equal(SOLVER_COST_WEIGHTS.carbohydrate, 1);
  assert.equal(SOLVER_COST_WEIGHTS.fat, 1);
  assert.equal(
    solverCost({ energy: 1, protein: 0, carbohydrate: 0, fat: 0 }),
    2,
  );
  assert.equal(
    solverCost({ energy: 0, protein: 3, carbohydrate: 0, fat: 0 }),
    9,
  );
});

test("fixture 8.7 sai das constantes: homem, 35 anos, 80 kg, 180 cm, moderada, perder", () => {
  const ageYears = 35;
  const weightKg = 80;
  const heightCm = 180;
  const restingCalories =
    MIFFLIN_ST_JEOR.weightPerKg * weightKg +
    MIFFLIN_ST_JEOR.heightPerCm * heightCm +
    MIFFLIN_ST_JEOR.agePerYear * ageYears +
    MIFFLIN_ST_JEOR.maleIntercept;
  const dailyExpenditureCalories = restingCalories * ACTIVITY_FACTORS.moderate;
  const rawTargetCalories = dailyExpenditureCalories * GOAL_MULTIPLIERS.lose;
  const targetCalories = roundEnergyTargetKcal(rawTargetCalories);
  const proteinGrams =
    (targetCalories * MACRO_PRESETS.lose.protein) /
    100 /
    KCAL_PER_GRAM.protein;
  const carbohydrateGrams =
    (targetCalories * MACRO_PRESETS.lose.carbohydrate) /
    100 /
    KCAL_PER_GRAM.carbohydrate;
  const fatGrams =
    (targetCalories * MACRO_PRESETS.lose.fat) / 100 / KCAL_PER_GRAM.fat;

  assert.equal(restingCalories, 1755);
  assert.equal(dailyExpenditureCalories, 2720.25);
  assert.equal(rawTargetCalories, 2312.2125);
  assert.equal(targetCalories, 2310);
  assert.equal(proteinGrams, 144.375);
  assert.equal(carbohydrateGrams, 259.875);
  assert.equal(fatGrams, 77);
  assert.equal(4 * proteinGrams + 4 * carbohydrateGrams + 9 * fatGrams, 2310);
});

test("estados da solução de porções cobrem a seção 10.6", () => {
  const states: Record<PortionSolutionState, true> = {
    within_targets: true,
    approximate: true,
    search_incomplete: true,
    missing_nutrition: true,
    invalid_selection: true,
    no_valid_portions: true,
    energy_budget_exhausted: true,
  };
  assert.deepEqual(PORTION_SOLUTION_STATES, Object.keys(states));
});
