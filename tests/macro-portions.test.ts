import assert from "node:assert/strict";
import test from "node:test";
import {
  SOLVER_EXHAUSTIVE_LIMIT,
  SOLVER_SEARCH_NODE_CAP,
  solveMealPortions,
} from "../src/domain/nutrition/solve-portions.ts";
import {
  portionTolerance,
  solverCost,
} from "../src/domain/nutrition/policy.ts";
import type {
  CarbohydrateBasis,
  FoodNutritionV2,
  FoodSource,
  FoodUnit,
  MealKey,
  MealSelection,
  NutritionTargets,
  PortionConstraints,
  PortionSolutionItem,
  SolveMealPortionsInput,
} from "../src/domain/types.ts";

const source: FoodSource = {
  name: "TBCA",
  code: "SYN",
  accessedAt: "2026-09-27",
};

function sheet(
  id: string,
  per100: {
    calories: number;
    protein: number | null;
    carbohydrate: number | null;
    fat: number | null;
  },
  basis: CarbohydrateBasis = "available",
): FoodNutritionV2 {
  return {
    foodId: id,
    caloriesPer100g: per100.calories,
    proteinPer100g: per100.protein,
    carbohydratePer100g: per100.carbohydrate,
    fatPer100g: per100.fat,
    carbohydrateBasis: basis,
    preparation: "sintético",
    source,
    version: "test",
  };
}

function limits(
  id: string,
  minimum: number,
  maximum: number,
  step: number,
  unit: FoodUnit | null = null,
): PortionConstraints {
  return { foodId: id, minimum, maximum, step, unit };
}

function selection(
  mealKey: MealKey,
  ids: {
    carbohydrateId: string;
    carbohydrate2Id?: string | null;
    proteinId: string;
    protein2Id?: string | null;
  },
): MealSelection {
  return {
    mealKey,
    carbohydrateId: ids.carbohydrateId,
    carbohydrate2Id: ids.carbohydrate2Id ?? null,
    proteinId: ids.proteinId,
    protein2Id: ids.protein2Id ?? null,
  };
}

function solve(
  partial: Omit<SolveMealPortionsInput, "policyId"> & {
    policyId?: SolveMealPortionsInput["policyId"];
  },
) {
  return solveMealPortions({ policyId: "experimental-v1", ...partial });
}

function gramsOf(items: readonly PortionSolutionItem[], id: string): number {
  const item = items.find((portion) => portion.foodId === id);
  assert.ok(item, id);
  return item.grams;
}

function domain(minimum: number, maximum: number, step: number): number[] {
  const first = Math.ceil(minimum / step - 1e-9);
  const last = Math.floor(maximum / step + 1e-9);
  const values: number[] = [];
  for (let index = first; index <= last; index += 1) values.push(index * step);
  return values.filter((grams) => grams + 1e-6 >= minimum && grams - 1e-6 <= maximum);
}

function exhaustiveBest(
  foods: readonly FoodNutritionV2[],
  constraints: readonly PortionConstraints[],
  order: readonly string[],
  targets: NutritionTargets,
): { grams: number[]; within: boolean; cost: number } {
  const tolerances = {
    energy: portionTolerance("energy", targets.calories),
    protein: portionTolerance("protein", targets.proteinGrams),
    carbohydrate: portionTolerance("carbohydrate", targets.carbohydrateGrams),
    fat: portionTolerance("fat", targets.fatGrams),
  };
  const axes = order.map((id) => {
    const food = foods.find((item) => item.foodId === id);
    const constraint = constraints.find((item) => item.foodId === id);
    assert.ok(food && constraint);
    return {
      food,
      grams: domain(constraint.minimum, constraint.maximum, constraint.step),
    };
  });
  let best: { grams: number[]; within: boolean; cost: number } | null = null;
  const chosen = Array<number>(axes.length).fill(0);
  const visit = (level: number) => {
    if (level === axes.length) {
      const totals = { calories: 0, protein: 0, carbohydrate: 0, fat: 0 };
      axes.forEach((axis, index) => {
        const grams = chosen[index]!;
        const factor = grams / 100;
        totals.calories += grams * axis.food.caloriesPer100g / 100;
        totals.protein += factor * (axis.food.proteinPer100g ?? 0);
        totals.carbohydrate += factor * (axis.food.carbohydratePer100g ?? 0);
        totals.fat += factor * (axis.food.fatPer100g ?? 0);
      });
      const normalized = {
        energy: (totals.calories - targets.calories) / tolerances.energy,
        protein: (totals.protein - targets.proteinGrams) / tolerances.protein,
        carbohydrate:
          (totals.carbohydrate - targets.carbohydrateGrams) /
          tolerances.carbohydrate,
        fat: (totals.fat - targets.fatGrams) / tolerances.fat,
      };
      const within =
        Math.abs(totals.calories - targets.calories) <= tolerances.energy &&
        Math.abs(totals.protein - targets.proteinGrams) <= tolerances.protein &&
        Math.abs(totals.carbohydrate - targets.carbohydrateGrams) <=
          tolerances.carbohydrate &&
        Math.abs(totals.fat - targets.fatGrams) <= tolerances.fat;
      const cost = solverCost(normalized);
      const grams = chosen.slice();
      const better = !best || prefers(within, cost, grams, best);
      if (better) best = { grams, within, cost };
      return;
    }
    for (const grams of axes[level]!.grams) {
      chosen[level] = grams;
      visit(level + 1);
    }
  };
  visit(0);
  assert.ok(best);
  return best;
}

function prefers(
  within: boolean,
  cost: number,
  grams: readonly number[],
  best: { grams: number[]; within: boolean; cost: number },
): boolean {
  if (within !== best.within) return within;
  if (Math.abs(cost - best.cost) > 1e-9) return cost < best.cost;
  for (let index = 0; index < grams.length; index += 1) {
    if (grams[index] !== best.grams[index]) return grams[index]! < best.grams[index]!;
  }
  return false;
}

test("acerta um ótimo conhecido e soma os nutrientes sem arredondar cada item", () => {
  const targets: NutritionTargets = {
    calories: 350,
    proteinGrams: 24,
    carbohydrateGrams: 40,
    fatGrams: 7,
  };
  const foods = [
    sheet("arroz", { calories: 100, protein: 2, carbohydrate: 20, fat: 1 }),
    sheet("frango", { calories: 150, protein: 20, carbohydrate: 0, fat: 5 }),
  ];
  const constraints = [
    limits("arroz", 20, 400, 20),
    limits("frango", 20, 300, 20),
  ];
  const input = {
    selection: selection("lunch", {
      carbohydrateId: "arroz",
      proteinId: "frango",
    }),
    targets,
    foods,
    constraints,
  };
  const result = solve(input);
  const oracle = exhaustiveBest(foods, constraints, ["arroz", "frango"], targets);
  assert.equal(result.state, "within_targets");
  assert.deepEqual(
    result.portions.map((portion) => portion.grams),
    oracle.grams,
  );
  assert.deepEqual(oracle.grams, [200, 100]);
  assert.equal(result.totals.calories, 350);
  assert.equal(result.totals.proteinGrams, 24);
  assert.equal(result.totals.carbohydrateGrams, 40);
  assert.equal(result.totals.fatGrams, 7);
  assert.equal(result.portions[0]?.calories, 200);
  assert.equal(result.portions[1]?.calories, 150);
  assert.equal(
    result.portions[0]!.calories + result.portions[1]!.calories,
    result.totals.calories,
  );
  assert.equal(result.targets.fatGrams, targets.fatGrams);
  assert.deepEqual(result.deviations, {
    calories: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
  });

  const halves = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets: { calories: 21, proteinGrams: 10, carbohydrateGrams: 10, fatGrams: 0 },
    foods: [
      sheet("c", { calories: 21, protein: 0, carbohydrate: 20, fat: 0 }),
      sheet("p", { calories: 21, protein: 20, carbohydrate: 0, fat: 0 }),
    ],
    constraints: [limits("c", 50, 50, 10), limits("p", 50, 50, 10)],
  });
  assert.equal(halves.portions[0]?.calories, 10.5);
  assert.equal(halves.portions[1]?.calories, 10.5);
  assert.equal(halves.totals.calories, 21);
});

test("coincide com a enumeração exaustiva em domínios pequenos", () => {
  const next = lcg(20260927);
  const integer = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  for (let sample = 0; sample < 12; sample += 1) {
    const width = sample % 3 === 0 ? 4 : sample % 3 === 1 ? 3 : 2;
    const ids = ["c1", "c2", "p1", "p2"].slice(0, width);
    const foods = ids.map((id) =>
      sheet(id, {
        calories: integer(40, 180),
        protein: integer(0, 30),
        carbohydrate: integer(0, 30),
        fat: integer(0, 15),
      }),
    );
    const constraints = ids.map((id) => {
      const step = 10;
      const minimum = 20;
      const maximum = minimum + step * integer(2, 4);
      return limits(id, minimum, maximum, step);
    });
    const anchor = ids.map((_, index) => constraints[index]!.minimum + 10);
    const targets = foods.reduce<NutritionTargets>(
      (sum, food, index) => {
        const factor = anchor[index]! / 100;
        return {
          calories: sum.calories + anchor[index]! * food.caloriesPer100g / 100,
          proteinGrams: sum.proteinGrams + factor * (food.proteinPer100g ?? 0),
          carbohydrateGrams:
            sum.carbohydrateGrams + factor * (food.carbohydratePer100g ?? 0),
          fatGrams: sum.fatGrams + factor * (food.fatPer100g ?? 0),
        };
      },
      { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 },
    );
    if (targets.calories <= 0) targets.calories = 50;
    const result = solve({
      selection: selection(width === 4 || width === 3 ? "breakfast" : "dinner", {
        carbohydrateId: ids[0]!,
        carbohydrate2Id: width >= 3 ? ids[1]! : null,
        proteinId: width === 4 ? ids[2]! : width === 3 ? ids[2]! : ids[1]!,
        protein2Id: width === 4 ? ids[3]! : null,
      }),
      targets,
      foods,
      constraints,
    });
    const slotOrder =
      width === 4
        ? [ids[0]!, ids[1]!, ids[2]!, ids[3]!]
        : width === 3
          ? [ids[0]!, ids[1]!, ids[2]!]
          : [ids[0]!, ids[1]!];
    const oracle = exhaustiveBest(foods, constraints, slotOrder, targets);
    assert.deepEqual(
      result.portions.map((portion) => portion.grams),
      oracle.grams,
      `amostra ${sample}`,
    );
    assert.equal(
      result.state,
      oracle.within ? "within_targets" : "approximate",
      `amostra ${sample}`,
    );
    assert.deepEqual(result.portions.map((portion) => portion.foodId), slotOrder);
  }
});

test("respeita mínimo, máximo e desempata pelo vetor de quantidades", () => {
  const foods = [
    sheet("a", { calories: 100, protein: 0, carbohydrate: 25, fat: 0 }),
    sheet("b", { calories: 100, protein: 0, carbohydrate: 25, fat: 0 }),
    sheet("p", { calories: 100, protein: 25, carbohydrate: 0, fat: 10 }),
  ];
  const constraints = [
    limits("a", 50, 100, 50),
    limits("b", 50, 100, 50),
    limits("p", 100, 100, 100),
  ];
  const targets: NutritionTargets = {
    calories: 250,
    proteinGrams: 25,
    carbohydrateGrams: 37.5,
    fatGrams: 10,
  };
  const result = solve({
    selection: selection("lunch", {
      carbohydrateId: "a",
      carbohydrate2Id: "b",
      proteinId: "p",
    }),
    targets,
    foods,
    constraints,
  });
  const oracle = exhaustiveBest(foods, constraints, ["a", "b", "p"], targets);
  assert.deepEqual(oracle.grams, [50, 100, 100]);
  assert.deepEqual(
    result.portions.map((portion) => portion.grams),
    [50, 100, 100],
  );
  assert.equal(result.state, "within_targets");
  assert.ok(result.portions.every((portion) => portion.grams > 0));

  const bounded = solve({
    selection: selection("lunch", {
      carbohydrateId: "a",
      proteinId: "p",
    }),
    targets: { calories: 80, proteinGrams: 5, carbohydrateGrams: 10, fatGrams: 1 },
    foods: [
      sheet("a", { calories: 400, protein: 0, carbohydrate: 80, fat: 0 }),
      sheet("p", { calories: 50, protein: 10, carbohydrate: 0, fat: 2 }),
    ],
    constraints: [limits("a", 80, 80, 10), limits("p", 40, 40, 10)],
  });
  assert.equal(gramsOf(bounded.portions, "a"), 80);
  assert.equal(gramsOf(bounded.portions, "p"), 40);
});

test("passo incompatível, porção não finita e meta energética zero", () => {
  const foods = [
    sheet("c", { calories: 100, protein: 2, carbohydrate: 20, fat: 1 }),
    sheet("p", { calories: 150, protein: 20, carbohydrate: 0, fat: 5 }),
  ];
  const targets: NutritionTargets = {
    calories: 300,
    proteinGrams: 20,
    carbohydrateGrams: 30,
    fatGrams: 8,
  };
  const base = {
    selection: selection("snack", { carbohydrateId: "c", proteinId: "p" }),
    targets,
    foods,
  };
  const incompatible = solve({
    ...base,
    constraints: [limits("c", 21, 29, 10), limits("p", 20, 100, 10)],
  });
  assert.equal(incompatible.state, "no_valid_portions");
  assert.equal(incompatible.portions.length, 0);
  assert.equal(incompatible.diagnostics[0]?.code, "empty_domain");

  for (const step of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const nonFinite = solve({
      ...base,
      constraints: [limits("c", 20, 100, step), limits("p", 20, 100, 10)],
    });
    assert.equal(nonFinite.state, "no_valid_portions");
    assert.equal(nonFinite.portions.length, 0);
  }

  const zeroEnergy = solve({
    ...base,
    targets: { ...targets, calories: 0 },
    constraints: [limits("c", 20, 100, 10), limits("p", 20, 100, 10)],
  });
  assert.equal(zeroEnergy.state, "energy_budget_exhausted");
  assert.equal(zeroEnergy.portions.length, 0);
  assert.equal(zeroEnergy.targets.fatGrams, targets.fatGrams);
});

test("dois alimentos em unidade e quatro seleções com contribuição completa", () => {
  const bread = sheet("pao", {
    calories: 200,
    protein: 0,
    carbohydrate: 40,
    fat: 0,
  });
  const egg = sheet("ovo", { calories: 100, protein: 20, carbohydrate: 0, fat: 10 });
  const unitConstraints = [
    limits("pao", 25, 100, 25, {
      singular: "fatia",
      plural: "fatias",
      gramsPerUnit: 50,
      stepUnits: 0.5,
    }),
    limits("ovo", 50, 150, 25, {
      singular: "ovo",
      plural: "ovos",
      gramsPerUnit: 50,
      stepUnits: 0.5,
    }),
  ];
  const targets: NutritionTargets = {
    calories: 200,
    proteinGrams: 20,
    carbohydrateGrams: 20,
    fatGrams: 10,
  };
  const units = solve({
    selection: selection("breakfast", { carbohydrateId: "pao", proteinId: "ovo" }),
    targets,
    foods: [bread, egg],
    constraints: unitConstraints,
  });
  const oracle = exhaustiveBest(
    [bread, egg],
    unitConstraints,
    ["pao", "ovo"],
    targets,
  );
  assert.deepEqual(oracle.grams, [50, 100]);
  assert.equal(units.state, "within_targets");
  assert.equal(gramsOf(units.portions, "pao"), 50);
  assert.equal(units.portions[0]?.units, 1);
  assert.equal(gramsOf(units.portions, "ovo"), 100);
  assert.equal(units.portions[1]?.units, 2);

  const quadFoods = [
    sheet("c1", { calories: 100, protein: 4, carbohydrate: 20, fat: 1 }),
    sheet("c2", { calories: 80, protein: 5, carbohydrate: 12, fat: 2 }),
    sheet("p1", { calories: 150, protein: 25, carbohydrate: 0, fat: 4 }),
    sheet("p2", { calories: 180, protein: 20, carbohydrate: 1, fat: 8 }),
  ];
  const grams = [100, 50, 80, 40];
  const quadTargets = quadFoods.reduce<NutritionTargets>(
    (sum, food, index) => {
      const factor = grams[index]! / 100;
      return {
        calories: sum.calories + grams[index]! * food.caloriesPer100g / 100,
        proteinGrams: sum.proteinGrams + factor * (food.proteinPer100g ?? 0),
        carbohydrateGrams:
          sum.carbohydrateGrams + factor * (food.carbohydratePer100g ?? 0),
        fatGrams: sum.fatGrams + factor * (food.fatPer100g ?? 0),
      };
    },
    { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 },
  );
  const quadConstraints = quadFoods.map((food) =>
    limits(food.foodId, 20, 120, 10),
  );
  const quad = solve({
    selection: selection("lunch", {
      carbohydrateId: "c1",
      carbohydrate2Id: "c2",
      proteinId: "p1",
      protein2Id: "p2",
    }),
    targets: quadTargets,
    foods: quadFoods,
    constraints: quadConstraints,
  });
  const quadOracle = exhaustiveBest(
    quadFoods,
    quadConstraints,
    ["c1", "c2", "p1", "p2"],
    quadTargets,
  );
  assert.equal(quadOracle.within, true);
  assert.equal(quad.state, "within_targets");
  assert.deepEqual(
    quad.portions.map((portion) => portion.grams),
    quadOracle.grams,
  );
  assert.ok(quad.totals.fatGrams > 0);
  assert.ok(quad.portions[0]!.fatGrams > 0);
  assert.equal(
    quad.portions.reduce((sum, portion) => sum + portion.fatGrams, 0),
    quad.totals.fatGrams,
  );
});

test("nutriente zero conhecido entra na soma e nutriente ausente não vira zero", () => {
  const zeroFat = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets: { calories: 200, proteinGrams: 20, carbohydrateGrams: 40, fatGrams: 0 },
    foods: [
      sheet("c", { calories: 100, protein: 0, carbohydrate: 40, fat: 0 }),
      sheet("p", { calories: 100, protein: 20, carbohydrate: 0, fat: 0 }),
    ],
    constraints: [limits("c", 100, 100, 10), limits("p", 100, 100, 10)],
  });
  assert.equal(zeroFat.state, "within_targets");
  assert.equal(zeroFat.totals.fatGrams, 0);
  assert.equal(zeroFat.portions.length, 2);

  const foods = [
    sheet("c", { calories: 100, protein: 2, carbohydrate: 20, fat: null }),
    sheet("p", { calories: 150, protein: 20, carbohydrate: 0, fat: 5 }),
    sheet("oleo", { calories: 900, protein: 0, carbohydrate: 0, fat: 100 }),
  ];
  const missing = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets: { calories: 300, proteinGrams: 20, carbohydrateGrams: 30, fatGrams: 8 },
    foods,
    constraints: [limits("c", 20, 200, 10), limits("p", 20, 200, 10)],
  });
  assert.equal(missing.state, "missing_nutrition");
  assert.equal(missing.portions.length, 0);
  assert.equal(missing.totals.fatGrams, 0);
  assert.ok(missing.diagnostics.some((item) => item.message.includes("c")));
  assert.ok(missing.diagnostics.some((item) => item.code === "missing_nutrient"));
  assert.equal(
    missing.portions.some((portion) => portion.foodId === "oleo"),
    false,
  );

  const basis = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets: { calories: 300, proteinGrams: 20, carbohydrateGrams: 30, fatGrams: 8 },
    foods: [
      sheet("c", { calories: 100, protein: 2, carbohydrate: 20, fat: 1 }, "unspecified"),
      sheet("p", { calories: 150, protein: 20, carbohydrate: 0, fat: 5 }),
    ],
    constraints: [limits("c", 20, 200, 10), limits("p", 20, 200, 10)],
  });
  assert.equal(basis.state, "missing_nutrition");
  assert.equal(basis.diagnostics[0]?.code, "carbohydrate_basis");
});

test("não marca within_targets quando a energia passa e um macro falha", () => {
  const foods = [
    sheet("c", { calories: 40, protein: 0, carbohydrate: 60, fat: 0 }),
    sheet("p", { calories: 20, protein: 0, carbohydrate: 10, fat: 0 }),
  ];
  const targets: NutritionTargets = {
    calories: 60,
    proteinGrams: 0,
    carbohydrateGrams: 80,
    fatGrams: 0,
  };
  const onlyNear = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets,
    foods,
    constraints: [limits("c", 100, 100, 100), limits("p", 100, 100, 100)],
  });
  assert.equal(onlyNear.totals.calories, 60);
  assert.equal(onlyNear.totals.carbohydrateGrams, 70);
  assert.ok(
    Math.abs(onlyNear.deviations.calories) <=
      portionTolerance("energy", targets.calories),
  );
  assert.ok(
    Math.abs(onlyNear.deviations.carbohydrateGrams) >
      portionTolerance("carbohydrate", targets.carbohydrateGrams),
  );
  assert.equal(onlyNear.state, "approximate");
  assert.notEqual(onlyNear.state, "within_targets");
  assert.ok(onlyNear.diagnostics.some((item) => item.message.includes("Carboidrato")));
  assert.equal(onlyNear.targets.fatGrams, 0);

  const corrected = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets,
    foods,
    constraints: [limits("c", 100, 100, 100), limits("p", 100, 200, 100)],
  });
  assert.equal(gramsOf(corrected.portions, "p"), 200);
  assert.equal(corrected.state, "within_targets");
  assert.equal(corrected.totals.carbohydrateGrams, 80);
  assert.equal(corrected.totals.calories, 80);
});

test("reclassifica pelo total do passo quando o arredondamento mais próximo piora", () => {
  const targets: NutritionTargets = {
    calories: 60,
    proteinGrams: 0,
    carbohydrateGrams: 80,
    fatGrams: 0,
  };
  let nearest = 100;
  let nearestCost = Number.POSITIVE_INFINITY;
  for (let grams = 100; grams <= 200; grams += 1) {
    const calories = 40 + grams * 0.2;
    const carbohydrate = 60 + grams * 0.1;
    const energyTolerance = portionTolerance("energy", targets.calories);
    const carbTolerance = portionTolerance("carbohydrate", targets.carbohydrateGrams);
    const cost = solverCost({
      energy: (calories - targets.calories) / energyTolerance,
      protein: 0,
      carbohydrate: (carbohydrate - targets.carbohydrateGrams) / carbTolerance,
      fat: 0,
    });
    if (cost < nearestCost) {
      nearestCost = cost;
      nearest = grams;
    }
  }
  const nearestStep = Math.abs(nearest - 100) <= Math.abs(nearest - 200) ? 100 : 200;
  assert.equal(nearestStep, 100);
  const snappedCarbohydrate = 60 + nearestStep * 0.1;
  assert.ok(
    Math.abs(snappedCarbohydrate - targets.carbohydrateGrams) >
      portionTolerance("carbohydrate", targets.carbohydrateGrams),
  );

  const result = solve({
    selection: selection("lunch", { carbohydrateId: "c", proteinId: "p" }),
    targets,
    foods: [
      sheet("c", { calories: 40, protein: 0, carbohydrate: 60, fat: 0 }),
      sheet("p", { calories: 20, protein: 0, carbohydrate: 10, fat: 0 }),
    ],
    constraints: [limits("c", 100, 100, 100), limits("p", 100, 200, 100)],
  });
  assert.equal(gramsOf(result.portions, "p"), 200);
  assert.equal(result.state, "within_targets");
  assert.equal(result.totals.carbohydrateGrams, 80);
  assert.equal(result.totals.calories, 80);
  assert.notEqual(result.state, "approximate");
});

test("não há candidato dentro das tolerâncias e a meta de gordura permanece", () => {
  const targets: NutritionTargets = {
    calories: 200,
    proteinGrams: 20,
    carbohydrateGrams: 20,
    fatGrams: 2,
  };
  const foods = [
    sheet("c", { calories: 100, protein: 2, carbohydrate: 20, fat: 20 }),
    sheet("p", { calories: 100, protein: 20, carbohydrate: 0, fat: 20 }),
  ];
  const constraints = [limits("c", 100, 100, 10), limits("p", 100, 100, 10)];
  const result = solve({
    selection: selection("dinner", { carbohydrateId: "c", proteinId: "p" }),
    targets,
    foods,
    constraints,
  });
  const oracle = exhaustiveBest(foods, constraints, ["c", "p"], targets);
  assert.equal(oracle.within, false);
  assert.equal(result.state, "approximate");
  assert.deepEqual(
    result.portions.map((portion) => portion.grams),
    oracle.grams,
  );
  assert.equal(result.targets.fatGrams, 2);
  assert.ok(result.totals.fatGrams > targets.fatGrams + 2);
  assert.equal(
    result.portions.some((portion) => portion.foodId === "oleo"),
    false,
  );
  assert.ok(result.diagnostics.some((item) => item.code === "outside_tolerance"));
});

test("seleção inválida, segunda proteína fora do café e do almoço, e resultado estável", () => {
  const foods = [
    sheet("c", { calories: 100, protein: 2, carbohydrate: 20, fat: 1 }),
    sheet("p", { calories: 150, protein: 20, carbohydrate: 0, fat: 4 }),
    sheet("extra", { calories: 900, protein: 0, carbohydrate: 0, fat: 100 }),
  ];
  const constraints = [
    limits("c", 50, 150, 10),
    limits("p", 40, 120, 10),
    limits("extra", 5, 20, 5),
  ];
  const targets: NutritionTargets = {
    calories: 180,
    proteinGrams: 16,
    carbohydrateGrams: 20,
    fatGrams: 4,
  };
  const input = {
    selection: selection("snack", {
      carbohydrateId: "c",
      carbohydrate2Id: "extra",
      proteinId: "p",
    }),
    targets,
    foods,
    constraints,
  };
  const first = solve(input);
  const second = solve(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(
    first.portions.some((portion) => portion.foodId === "extra"),
    true,
  );
  const hidden = solve({
    ...input,
    selection: selection("snack", { carbohydrateId: "c", proteinId: "p" }),
  });
  assert.equal(
    hidden.portions.some((portion) => portion.foodId === "extra"),
    false,
  );

  const duplicate = solve({
    selection: selection("lunch", {
      carbohydrateId: "c",
      carbohydrate2Id: "c",
      proteinId: "p",
    }),
    targets,
    foods,
    constraints,
  });
  assert.equal(duplicate.state, "invalid_selection");
  assert.equal(duplicate.portions.length, 0);

  const dinnerProtein = solve({
    selection: selection("dinner", {
      carbohydrateId: "c",
      proteinId: "p",
      protein2Id: "extra",
    }),
    targets,
    foods,
    constraints,
  });
  assert.equal(dinnerProtein.state, "invalid_selection");
  assert.equal(dinnerProtein.diagnostics[0]?.code, "second_protein_not_allowed");

  const snapshot = structuredClone(input);
  solve(input);
  assert.deepEqual(input, snapshot);
});

test("busca grande demais termina inconclusiva em vez de declarar impossibilidade", () => {
  const count = 100;
  const step = 5;
  const minimum = 20;
  const maximum = minimum + (count - 1) * step;
  assert.ok(count ** 4 > SOLVER_EXHAUSTIVE_LIMIT);
  assert.ok(count ** 3 > SOLVER_SEARCH_NODE_CAP);
  const foods = ["c1", "c2", "p1", "p2"].map((id) =>
    sheet(id, { calories: 200, protein: 50, carbohydrate: 50, fat: 20 }),
  );
  const constraints = foods.map((food) =>
    limits(food.foodId, minimum, maximum, step),
  );
  const targets: NutritionTargets = {
    calories: 800,
    proteinGrams: 400,
    carbohydrateGrams: 200,
    fatGrams: 80,
  };
  const started = performance.now();
  const result = solve({
    selection: selection("breakfast", {
      carbohydrateId: "c1",
      carbohydrate2Id: "c2",
      proteinId: "p1",
      protein2Id: "p2",
    }),
    targets,
    foods,
    constraints,
  });
  const elapsed = performance.now() - started;
  assert.equal(result.state, "search_incomplete");
  assert.notEqual(result.state, "no_valid_portions");
  assert.equal(result.portions.length, 4);
  assert.ok(result.portions.every((portion) => portion.grams > 0));
  assert.equal(result.targets.fatGrams, targets.fatGrams);
  assert.ok(result.diagnostics.some((item) => item.code === "search_incomplete"));
  assert.ok(elapsed < 500, `busca inconclusiva levou ${elapsed} ms`);
});

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
