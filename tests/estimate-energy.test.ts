import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDietProposal } from "../src/domain/nutrition/create-diet-plan.ts";
import { estimateEnergy } from "../src/domain/nutrition/estimate-energy.ts";
import {
  convertHeightToCentimeters,
  parseBrazilianDecimal,
  validateAssessment,
  type DietAssessmentInput,
} from "../src/domain/nutrition/nutrition-validation.ts";
import { experimentalV1Policy } from "../src/domain/nutrition/policy.ts";
import type { DietAssessment, EquationCoefficient } from "../src/domain/types.ts";

const policy = experimentalV1Policy;

function assessment(
  overrides: Partial<DietAssessment> = {},
): DietAssessment {
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

function input(overrides: Partial<DietAssessmentInput> = {}): DietAssessmentInput {
  return {
    personKey: "felipe",
    ageYears: 35,
    height: 180,
    heightUnit: "cm",
    weightKg: 80,
    equationCoefficient: "male",
    goal: "lose",
    activityLevel: "moderate",
    ...overrides,
  };
}

test("fixture 8.7: homem, 35 anos, 80 kg, 180 cm, moderada, perder", () => {
  const result = estimateEnergy(assessment(), policy);
  assert.equal(result.policyId, "experimental-v1");
  assert.equal(result.restingCalories, 1755);
  assert.equal(result.dailyExpenditureCalories, 2720.25);
  assert.equal(result.rawTargetCalories, 2312.2125);
  assert.equal(result.targetCalories, 2310);
  assert.deepEqual(result.diagnostics, []);

  const proposal = createDietProposal(assessment(), policy, []);
  assert.equal(proposal.daily?.calories, 2310);
  assert.equal(proposal.daily?.proteinGrams, 144.375);
  assert.equal(proposal.daily?.carbohydrateGrams, 259.875);
  assert.equal(proposal.daily?.fatGrams, 77);
  assert.equal(
    4 * 144.375 + 4 * 259.875 + 9 * 77,
    2310,
  );
  assert.ok(proposal.daily);
  const gap = Math.abs(
    proposal.daily.calories -
      (4 * proposal.daily.proteinGrams +
        4 * proposal.daily.carbohydrateGrams +
        9 * proposal.daily.fatGrams),
  );
  assert.ok(gap <= policy.coherenceEpsilonKcal);
});

test("desempate do passo de 10 kcal arredonda para cima", () => {
  const result = estimateEnergy(
    assessment({
      ageYears: 18,
      weightKg: 60,
      heightCm: 180,
      activityLevel: "light",
      goal: "maintain",
    }),
    policy,
  );
  assert.equal(result.restingCalories, 1640);
  assert.equal(result.dailyExpenditureCalories, 2255);
  assert.equal(result.rawTargetCalories, 2255);
  assert.equal(result.targetCalories, 2260);
  assert.deepEqual(result.diagnostics, []);
});

test("piso feminino de 1200 kcal mantém a meta bruta e ajusta os macros", () => {
  const result = createDietProposal(
    assessment({
      personKey: "gabriela",
      ageYears: 25,
      weightKg: 45,
      heightCm: 155,
      equationCoefficient: "female",
      activityLevel: "low",
      goal: "lose",
    }),
    policy,
    [],
  );
  assert.equal(result.estimate.restingCalories, 1132.75);
  assert.equal(result.estimate.dailyExpenditureCalories, 1359.3);
  assert.equal(result.estimate.rawTargetCalories, 1155.405);
  assert.equal(result.estimate.targetCalories, 1200);
  assert.equal(result.estimate.diagnostics[0]?.code, "energy_floor_applied");
  assert.equal(result.daily?.calories, 1200);
  assert.equal(result.daily?.proteinGrams, 75);
  assert.equal(result.daily?.carbohydrateGrams, 135);
  assert.equal(result.daily?.fatGrams, 40);
  assert.equal(4 * 75 + 4 * 135 + 9 * 40, 1200);
});

test("piso masculino de 1500 kcal usa a meta ajustada nos macros", () => {
  const result = createDietProposal(
    assessment({
      ageYears: 30,
      weightKg: 55,
      heightCm: 165,
      equationCoefficient: "male",
      activityLevel: "low",
      goal: "lose",
    }),
    policy,
    [],
  );
  assert.equal(result.estimate.rawTargetCalories, 1464.975);
  assert.equal(result.estimate.targetCalories, 1500);
  assert.equal(result.estimate.diagnostics[0]?.code, "energy_floor_applied");
  assert.equal(result.daily?.proteinGrams, 93.75);
  assert.equal(result.daily?.carbohydrateGrams, 168.75);
  assert.equal(result.daily?.fatGrams, 50);
});

test("goal_conflict não aplica o piso quando ele inverteria a perda de peso", () => {
  const source = assessment({
    personKey: "gabriela",
    ageYears: 80,
    weightKg: 35,
    heightCm: 120,
    equationCoefficient: "female",
    activityLevel: "low",
    goal: "lose",
  });
  const before = structuredClone(source);
  const result = createDietProposal(source, policy, []);
  assert.deepEqual(source, before);
  assert.equal(result.estimate.restingCalories, 539);
  assert.equal(result.estimate.dailyExpenditureCalories, 646.8);
  assert.equal(result.estimate.rawTargetCalories, 549.78);
  assert.equal(result.estimate.targetCalories, null);
  assert.equal(result.estimate.diagnostics.length, 1);
  assert.equal(result.estimate.diagnostics[0]?.code, "goal_conflict");
  assert.equal(result.daily, null);
  assert.deepEqual(result.meals, []);
});

test("acima de 5000 kcal devolve unsupported_energy_range sem cortar", () => {
  const result = estimateEnergy(
    assessment({
      ageYears: 18,
      weightKg: 160,
      heightCm: 210,
      activityLevel: "high",
      goal: "gain",
    }),
    policy,
  );
  assert.equal(result.restingCalories, 2827.5);
  assert.equal(result.dailyExpenditureCalories, 4877.4375);
  assert.ok(result.rawTargetCalories > policy.energyCeilingKcal);
  assert.equal(result.targetCalories, null);
  assert.notEqual(result.targetCalories, 5000);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "unsupported_energy_range");
});

test("meta alta ainda dentro do teto continua aplicável", () => {
  const result = estimateEnergy(
    assessment({
      ageYears: 18,
      weightKg: 160,
      heightCm: 200,
      activityLevel: "high",
      goal: "maintain",
    }),
    policy,
  );
  assert.equal(result.dailyExpenditureCalories, 4769.625);
  assert.equal(result.rawTargetCalories, 4769.625);
  assert.equal(result.targetCalories, 4770);
  assert.ok((result.targetCalories ?? 0) <= policy.energyCeilingKcal);
  assert.deepEqual(result.diagnostics, []);
});

test("gestação ou dieta terapêutica devolve unsupported_profile e não apaga a avaliação", () => {
  const pregnant = assessment({ pregnantOrLactating: true });
  const before = structuredClone(pregnant);
  const pregnancy = createDietProposal(pregnant, policy, []);
  assert.deepEqual(pregnant, before);
  assert.equal(pregnancy.estimate.targetCalories, null);
  assert.equal(pregnancy.daily, null);
  assert.equal(pregnancy.diagnostics[0]?.code, "unsupported_profile");
  assert.notEqual(pregnancy.estimate.targetCalories, 2310);

  const therapeutic = estimateEnergy(
    assessment({ therapeuticDietRequired: true }),
    policy,
  );
  assert.equal(therapeutic.targetCalories, null);
  assert.equal(therapeutic.diagnostics[0]?.code, "unsupported_profile");
});

test("não infere coeficiente pelo nome do perfil", () => {
  const asMale = estimateEnergy(
    assessment({ personKey: "gabriela", equationCoefficient: "male" }),
    policy,
  );
  const asFemale = estimateEnergy(
    assessment({
      personKey: "felipe",
      equationCoefficient: "female" satisfies EquationCoefficient,
    }),
    policy,
  );
  assert.equal(asMale.restingCalories, 1755);
  assert.equal(asFemale.restingCalories, 1589);

  const missing = validateAssessment(
    input({ personKey: "felipe", equationCoefficient: undefined }),
  );
  assert.equal(missing.valid, false);
  assert.equal(missing.estimationCompleted, false);
  assert.equal(missing.assessment, null);
  assert.equal(
    missing.issues.some((item) => item.code === "missing_equation_coefficient"),
    true,
  );
  assert.equal(
    missing.issues.some((item) => item.code === "energy_floor_applied"),
    false,
  );
});

test("vírgula decimal e altura em metros viram centímetros para conferência", () => {
  assert.equal(parseBrazilianDecimal("80,5"), 80.5);
  assert.equal(parseBrazilianDecimal("1.800,5"), 1800.5);
  assert.equal(parseBrazilianDecimal("1,80"), 1.8);
  assert.equal(Number.isFinite(parseBrazilianDecimal("")), false);
  assert.equal(Number.isFinite(parseBrazilianDecimal("abc")), false);
  assert.equal(Number.isFinite(parseBrazilianDecimal("NaN")), false);
  assert.equal(Number.isFinite(parseBrazilianDecimal("Infinity")), false);
  assert.equal(convertHeightToCentimeters(1.8, "m"), 180);
  assert.equal(convertHeightToCentimeters(180, "cm"), 180);

  const parsed = validateAssessment(
    input({
      ageYears: "35",
      height: "1,80",
      heightUnit: "m",
      weightKg: "80",
    }),
  );
  assert.equal(parsed.valid, true);
  assert.equal(parsed.estimationCompleted, true);
  assert.equal(parsed.heightReview?.centimeters, 180);
  assert.equal(parsed.heightReview?.sourceUnit, "m");
  assert.equal(parsed.assessment?.heightCm, 180);
  assert.ok(parsed.assessment);

  const fromText = createDietProposal(parsed.assessment, policy, []);
  const fromNumbers = createDietProposal(assessment(), policy, []);
  assert.deepEqual(fromText.daily, fromNumbers.daily);
  assert.equal(fromText.estimate.targetCalories, 2310);
});

test("rejeita vazio, NaN, infinito, não positivo e fora da faixa", () => {
  const empty = validateAssessment(
    input({
      ageYears: "",
      height: " ",
      weightKg: null,
      goal: "",
      activityLevel: undefined,
    }),
  );
  assert.equal(empty.valid, false);
  assert.equal(empty.assessment, null);
  for (const field of ["ageYears", "height", "weightKg", "goal", "activityLevel"]) {
    assert.equal(
      empty.issues.some((item) => item.field === field && item.code === "required"),
      true,
      field,
    );
  }

  const invalid = validateAssessment(
    input({
      ageYears: Number.NaN,
      height: Number.POSITIVE_INFINITY,
      weightKg: "80kg",
    }),
  );
  assert.equal(
    invalid.issues.filter((item) => item.code === "invalid_number").length >= 3,
    true,
  );

  const nonPositive = validateAssessment(input({ ageYears: 0, height: -1, weightKg: 0 }));
  assert.equal(
    nonPositive.issues.filter((item) => item.code === "non_positive").length,
    3,
  );

  const low = validateAssessment(input({ ageYears: 17, height: 119, weightKg: 34 }));
  const high = validateAssessment(input({ ageYears: 81, height: 231, weightKg: 251 }));
  for (const result of [low, high]) {
    assert.equal(result.valid, false);
    assert.equal(
      result.issues.filter((item) => item.code === "out_of_bounds").length,
      3,
    );
  }

  const edges = validateAssessment(
    input({ ageYears: 18, height: 120, weightKg: 35 }),
  );
  assert.equal(edges.valid, true);
  const upper = validateAssessment(
    input({ ageYears: 80, height: 230, weightKg: 250 }),
  );
  assert.equal(upper.valid, true);

  const metersOut = validateAssessment(input({ height: "1,10", heightUnit: "m" }));
  assert.equal(metersOut.heightReview?.centimeters, 110);
  assert.equal(metersOut.heightReview?.sourceUnit, "m");
  assert.equal(metersOut.valid, false);
  assert.equal(
    metersOut.issues.some((item) => item.field === "height" && item.code === "out_of_bounds"),
    true,
  );
});

test("não consulta rede nem armazenamento local", () => {
  const files = [
    "estimate-energy.ts",
    "create-diet-plan.ts",
    "distribute-targets.ts",
    "nutrition-validation.ts",
  ];
  for (const file of files) {
    const source = readFileSync(
      new URL(`../src/domain/nutrition/${file}`, import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(source.includes("localStorage"), false, file);
    assert.equal(source.includes("XMLHttpRequest"), false, file);
  }
  const result = estimateEnergy(assessment(), policy);
  assert.equal(result.targetCalories, 2310);
});
