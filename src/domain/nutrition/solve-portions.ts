import type {
  Diagnostic,
  FoodNutritionV2,
  FoodUnit,
  MealKey,
  MealSelectionSlot,
  NutritionTargets,
  PortionSolution,
  PortionSolutionItem,
  PortionSolutionState,
  SolveMealPortionsInput,
} from "../types.ts";
import {
  POLICY_VERSION,
  SOLVER_COST_WEIGHTS,
  portionTolerance,
} from "./policy.ts";

/**
 * Acima deste produto de passos a enumeração completa não roda.
 * O café/almoço com quatro alimentos no passo de 5 g fica abaixo do limite.
 */
export const SOLVER_EXHAUSTIVE_LIMIT = 40_000_000;

/**
 * Visitas da busca podada quando o produto passa do limite de enumeração.
 * Estourar o limite devolve search_incomplete, sem declarar impossibilidade.
 */
export const SOLVER_SEARCH_NODE_CAP = 200_000;

const MAX_TABLE_STEPS = 8_000;
const WITHIN_SLACK = 1e-6;
const COST_TIE = 1e-9;

const MEALS_WITH_SECOND_PROTEIN: ReadonlySet<MealKey> = new Set([
  "breakfast",
  "lunch",
]);

const WEIGHTS = [
  SOLVER_COST_WEIGHTS.energy,
  SOLVER_COST_WEIGHTS.protein,
  SOLVER_COST_WEIGHTS.carbohydrate,
  SOLVER_COST_WEIGHTS.fat,
] as const;

interface Axis {
  slot: MealSelectionSlot;
  foodId: string;
  food: FoodNutritionV2;
  unit: FoodUnit | null;
  step: number;
  firstK: number;
  count: number;
  /** kcal, proteína, carboidrato e gordura por grama. */
  perGram: readonly [number, number, number, number];
  table: Float64Array | null;
}

interface Candidate {
  indices: number[];
  totals: [number, number, number, number];
  cost: number;
  within: boolean;
}

function clean(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function gramsOf(axis: Axis, index: number): number {
  return clean((axis.firstK + index) * axis.step);
}

function diagnostic(code: string, message: string): Diagnostic {
  return { code, message };
}

function emptyTargets(): NutritionTargets {
  return {
    calories: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
  };
}

function copyTargets(targets: NutritionTargets): NutritionTargets {
  return {
    calories: targets.calories,
    proteinGrams: targets.proteinGrams,
    carbohydrateGrams: targets.carbohydrateGrams,
    fatGrams: targets.fatGrams,
  };
}

function sumPortions(portions: readonly PortionSolutionItem[]): NutritionTargets {
  const totals = emptyTargets();
  for (const portion of portions) {
    totals.calories += portion.calories;
    totals.proteinGrams += portion.proteinGrams;
    totals.carbohydrateGrams += portion.carbohydrateGrams;
    totals.fatGrams += portion.fatGrams;
  }
  return totals;
}

function finish(
  mealKey: MealKey,
  state: PortionSolutionState,
  targets: NutritionTargets,
  portions: readonly PortionSolutionItem[],
  diagnostics: readonly Diagnostic[],
): PortionSolution {
  const safeTargets = copyTargets(targets);
  const totals = sumPortions(portions);
  return {
    mealKey,
    state,
    portions,
    totals,
    targets: safeTargets,
    deviations: {
      calories: totals.calories - safeTargets.calories,
      proteinGrams: totals.proteinGrams - safeTargets.proteinGrams,
      carbohydrateGrams:
        totals.carbohydrateGrams - safeTargets.carbohydrateGrams,
      fatGrams: totals.fatGrams - safeTargets.fatGrams,
    },
    diagnostics,
  };
}

function invalid(
  mealKey: MealKey,
  targets: NutritionTargets,
  code: string,
  message: string,
): PortionSolution {
  return finish(mealKey, "invalid_selection", targets, [], [
    diagnostic(code, message),
  ]);
}

function optionalId(id: string | null | undefined): string | null {
  return id == null ? null : id;
}

function alignment(
  minimum: number,
  maximum: number,
  step: number,
): { firstK: number; count: number } | null {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(step)) {
    return null;
  }
  if (!(minimum > 0) || !(step > 0) || !(maximum >= minimum)) return null;
  let firstK = Math.ceil(minimum / step - 1e-9);
  let lastK = Math.floor(maximum / step + 1e-9);
  if (!Number.isFinite(firstK) || !Number.isFinite(lastK)) return null;
  while (firstK <= lastK && clean(firstK * step) < minimum - 1e-6) firstK += 1;
  while (lastK >= firstK && clean(lastK * step) > maximum + 1e-6) lastK -= 1;
  if (lastK < firstK) return { firstK, count: 0 };
  const count = lastK - firstK + 1;
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  const low = clean(firstK * step);
  if (!(low > 0)) return null;
  return { firstK, count };
}

function buildTable(axis: Axis): Float64Array {
  const table = new Float64Array(axis.count * 4);
  for (let index = 0; index < axis.count; index += 1) {
    const grams = gramsOf(axis, index);
    const offset = index * 4;
    table[offset] = grams * axis.perGram[0];
    table[offset + 1] = grams * axis.perGram[1];
    table[offset + 2] = grams * axis.perGram[2];
    table[offset + 3] = grams * axis.perGram[3];
  }
  return table;
}

function contribOf(axis: Axis, index: number): [number, number, number, number] {
  if (axis.table) {
    const offset = index * 4;
    return [
      axis.table[offset]!,
      axis.table[offset + 1]!,
      axis.table[offset + 2]!,
      axis.table[offset + 3]!,
    ];
  }
  const grams = gramsOf(axis, index);
  return [
    grams * axis.perGram[0],
    grams * axis.perGram[1],
    grams * axis.perGram[2],
    grams * axis.perGram[3],
  ];
}

function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(rows[pivot]![col]!) < 1e-12) return null;
    const pivotRow = rows[pivot]!;
    rows[pivot] = rows[col]!;
    rows[col] = pivotRow;
    const divisor = rows[col]![col]!;
    for (let k = col; k <= size; k += 1) rows[col]![k]! /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = rows[row]![col]!;
      if (factor === 0) continue;
      for (let k = col; k <= size; k += 1) {
        rows[row]![k]! -= factor * rows[col]![k]!;
      }
    }
  }
  return rows.map((row) => row[size]!);
}

function continuousGrams(
  axes: readonly Axis[],
  targets: readonly number[],
  tolerances: readonly number[],
): number[] {
  const width = axes.length;
  const scale = WEIGHTS.map((weight, metric) => Math.sqrt(weight) / tolerances[metric]!);
  const factor = [0, 1, 2, 3].map((metric) =>
    axes.map((axis) => scale[metric]! * axis.perGram[metric]!),
  );
  const goal = scale.map((value, metric) => value * targets[metric]!);
  const normal = Array.from({ length: width }, () => Array<number>(width).fill(0));
  const rhs = Array<number>(width).fill(0);
  for (let row = 0; row < width; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let sum = 0;
      for (let metric = 0; metric < 4; metric += 1) {
        sum += factor[metric]![row]! * factor[metric]![col]!;
      }
      normal[row]![col] = sum;
    }
    let sum = 0;
    for (let metric = 0; metric < 4; metric += 1) {
      sum += factor[metric]![row]! * goal[metric]!;
    }
    rhs[row] = sum;
  }
  const solved = solveLinear(normal, rhs);
  const low = axes.map((axis) => gramsOf(axis, 0));
  const high = axes.map((axis) => gramsOf(axis, axis.count - 1));
  let grams = solved
    ? solved.map((value, index) => clamp(value, low[index]!, high[index]!))
    : low.map((value, index) => (value + high[index]!) / 2);

  const quadratic = (point: readonly number[]): number => {
    let sum = 0;
    for (let metric = 0; metric < 4; metric += 1) {
      let residual = -goal[metric]!;
      for (let index = 0; index < width; index += 1) {
        residual += factor[metric]![index]! * point[index]!;
      }
      sum += residual * residual;
    }
    return sum;
  };

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const gradient = Array<number>(width).fill(0);
    for (let index = 0; index < width; index += 1) {
      let slope = 0;
      for (let metric = 0; metric < 4; metric += 1) {
        let residual = -goal[metric]!;
        for (let other = 0; other < width; other += 1) {
          residual += factor[metric]![other]! * grams[other]!;
        }
        slope += factor[metric]![index]! * residual;
      }
      gradient[index] = slope;
    }
    const current = quadratic(grams);
    let alpha = 1;
    let improved = false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const trial = grams.map((value, index) =>
        clamp(value - alpha * gradient[index]!, low[index]!, high[index]!),
      );
      if (quadratic(trial) < current - 1e-12) {
        grams = trial;
        improved = true;
        break;
      }
      alpha *= 0.5;
    }
    if (!improved) break;
  }
  return grams;
}

function nearestIndex(axis: Axis, grams: number): number {
  const approximate = Math.round(grams / axis.step - axis.firstK);
  let index = clamp(approximate, 0, axis.count - 1);
  let bestDistance = Math.abs(gramsOf(axis, index) - grams);
  for (const delta of [-1, 1]) {
    const neighbor = index + delta;
    if (neighbor < 0 || neighbor >= axis.count) continue;
    const distance = Math.abs(gramsOf(axis, neighbor) - grams);
    if (distance < bestDistance - 1e-9) {
      index = neighbor;
      bestDistance = distance;
    }
  }
  return index;
}

/**
 * Enumeração de quatro eixos sem alocar candidato a cada passo.
 * A varredura cresce em ordem lexicográfica, então o primeiro mínimo
 * de custo dentro da mesma classe (dentro ou fora) já é o desempate estável.
 */
function exhaustiveFour(
  axes: readonly Axis[],
  targets: readonly number[],
  tolerances: readonly number[],
): Candidate {
  const left = axes[0]!.table!;
  const second = axes[1]!.table!;
  const third = axes[2]!.table!;
  const right = axes[3]!.table!;
  const n0 = axes[0]!.count;
  const n1 = axes[1]!.count;
  const n2 = axes[2]!.count;
  const n3 = axes[3]!.count;
  const energyTarget = targets[0]!;
  const proteinTarget = targets[1]!;
  const carbohydrateTarget = targets[2]!;
  const fatTarget = targets[3]!;
  const energyTolerance = tolerances[0]!;
  const proteinTolerance = tolerances[1]!;
  const carbohydrateTolerance = tolerances[2]!;
  const fatTolerance = tolerances[3]!;
  const energyWeight = WEIGHTS[0];
  const proteinWeight = WEIGHTS[1];
  const carbohydrateWeight = WEIGHTS[2];
  const fatWeight = WEIGHTS[3];
  let bestCost = Number.POSITIVE_INFINITY;
  let bestWithin = false;
  let bestI = 0;
  let bestJ = 0;
  let bestK = 0;
  let bestM = 0;
  let bestEnergy = 0;
  let bestProtein = 0;
  let bestCarbohydrate = 0;
  let bestFat = 0;

  for (let i = 0; i < n0; i += 1) {
    const offsetA = i * 4;
    const energyA = left[offsetA]!;
    const proteinA = left[offsetA + 1]!;
    const carbohydrateA = left[offsetA + 2]!;
    const fatA = left[offsetA + 3]!;
    for (let j = 0; j < n1; j += 1) {
      const offsetB = j * 4;
      const energyB = energyA + second[offsetB]!;
      const proteinB = proteinA + second[offsetB + 1]!;
      const carbohydrateB = carbohydrateA + second[offsetB + 2]!;
      const fatB = fatA + second[offsetB + 3]!;
      for (let k = 0; k < n2; k += 1) {
        const offsetC = k * 4;
        const energyC = energyB + third[offsetC]!;
        const proteinC = proteinB + third[offsetC + 1]!;
        const carbohydrateC = carbohydrateB + third[offsetC + 2]!;
        const fatC = fatB + third[offsetC + 3]!;
        for (let m = 0; m < n3; m += 1) {
          const offsetD = m * 4;
          const energy = energyC + right[offsetD]!;
          const protein = proteinC + right[offsetD + 1]!;
          const carbohydrate = carbohydrateC + right[offsetD + 2]!;
          const fat = fatC + right[offsetD + 3]!;
          const within =
            Math.abs(energy - energyTarget) <= energyTolerance + WITHIN_SLACK &&
            Math.abs(protein - proteinTarget) <= proteinTolerance + WITHIN_SLACK &&
            Math.abs(carbohydrate - carbohydrateTarget) <=
              carbohydrateTolerance + WITHIN_SLACK &&
            Math.abs(fat - fatTarget) <= fatTolerance + WITHIN_SLACK;
          if (bestWithin && !within) continue;
          const energyError = (energy - energyTarget) / energyTolerance;
          const proteinError = (protein - proteinTarget) / proteinTolerance;
          const carbohydrateError =
            (carbohydrate - carbohydrateTarget) / carbohydrateTolerance;
          const fatError = (fat - fatTarget) / fatTolerance;
          const cost =
            energyWeight * energyError * energyError +
            proteinWeight * proteinError * proteinError +
            carbohydrateWeight * carbohydrateError * carbohydrateError +
            fatWeight * fatError * fatError;
          if (within === bestWithin && cost >= bestCost - COST_TIE) continue;
          bestCost = cost;
          bestWithin = within;
          bestI = i;
          bestJ = j;
          bestK = k;
          bestM = m;
          bestEnergy = energy;
          bestProtein = protein;
          bestCarbohydrate = carbohydrate;
          bestFat = fat;
        }
      }
    }
  }

  return {
    indices: [bestI, bestJ, bestK, bestM],
    totals: [bestEnergy, bestProtein, bestCarbohydrate, bestFat],
    cost: bestCost,
    within: bestWithin,
  };
}

function costOf(
  totals: readonly number[],
  targets: readonly number[],
  tolerances: readonly number[],
): number {
  let cost = 0;
  for (let metric = 0; metric < 4; metric += 1) {
    const error = (totals[metric]! - targets[metric]!) / tolerances[metric]!;
    cost += WEIGHTS[metric]! * error * error;
  }
  return cost;
}

function withinTotals(
  totals: readonly number[],
  targets: readonly number[],
  tolerances: readonly number[],
): boolean {
  for (let metric = 0; metric < 4; metric += 1) {
    if (Math.abs(totals[metric]! - targets[metric]!) > tolerances[metric]! + WITHIN_SLACK) {
      return false;
    }
  }
  return true;
}

function prefer(next: Candidate, current: Candidate): boolean {
  if (next.within !== current.within) return next.within;
  if (Math.abs(next.cost - current.cost) > COST_TIE) return next.cost < current.cost;
  for (let index = 0; index < next.indices.length; index += 1) {
    if (next.indices[index] !== current.indices[index]) {
      return next.indices[index]! < current.indices[index]!;
    }
  }
  return false;
}

function axisRange(axis: Axis): [number, number][] {
  const lowGrams = gramsOf(axis, 0);
  const highGrams = gramsOf(axis, axis.count - 1);
  return axis.perGram.map((density) => {
    const start = lowGrams * density;
    const end = highGrams * density;
    return start <= end ? [start, end] : [end, start];
  });
}

function suffixBounds(axes: readonly Axis[]): { lo: number[][]; hi: number[][] } {
  const lo = Array.from({ length: axes.length + 1 }, () => [0, 0, 0, 0]);
  const hi = Array.from({ length: axes.length + 1 }, () => [0, 0, 0, 0]);
  for (let level = axes.length - 1; level >= 0; level -= 1) {
    const range = axisRange(axes[level]!);
    for (let metric = 0; metric < 4; metric += 1) {
      lo[level]![metric] = lo[level + 1]![metric]! + range[metric]![0]!;
      hi[level]![metric] = hi[level + 1]![metric]! + range[metric]![1]!;
    }
  }
  return { lo, hi };
}

function portionsFrom(
  axes: readonly Axis[],
  indices: readonly number[],
): PortionSolutionItem[] {
  return axes.map((axis, index) => {
    const grams = gramsOf(axis, indices[index]!);
    return {
      foodId: axis.foodId,
      role: axis.slot,
      grams,
      units: axis.unit ? clean(grams / axis.unit.gramsPerUnit) : null,
      calories: grams * axis.perGram[0],
      proteinGrams: grams * axis.perGram[1],
      carbohydrateGrams: grams * axis.perGram[2],
      fatGrams: grams * axis.perGram[3],
    };
  });
}

function totalsOfPortions(portions: readonly PortionSolutionItem[]): [number, number, number, number] {
  const totals = sumPortions(portions);
  return [
    totals.calories,
    totals.proteinGrams,
    totals.carbohydrateGrams,
    totals.fatGrams,
  ];
}

export function solveMealPortions(input: SolveMealPortionsInput): PortionSolution {
  const mealKey = input.selection?.mealKey ?? "lunch";
  const targets = input.targets ?? emptyTargets();

  if (input.policyId !== POLICY_VERSION) {
    return invalid(
      mealKey,
      targets,
      "invalid_policy",
      "A política de cálculo não é a experimental-v1.",
    );
  }
  if (!input.selection || !input.foods || !input.constraints) {
    return invalid(mealKey, targets, "invalid_selection", "Seleção incompleta.");
  }

  const selection = input.selection;
  if (!selection.carbohydrateId || !selection.proteinId) {
    return invalid(
      mealKey,
      targets,
      "invalid_selection",
      "Carboidrato e proteína são obrigatórios.",
    );
  }
  const carbohydrate2Id = optionalId(selection.carbohydrate2Id);
  const protein2Id = optionalId(selection.protein2Id);
  if (carbohydrate2Id === "" || protein2Id === "") {
    return invalid(
      mealKey,
      targets,
      "invalid_selection",
      "Identificador de alimento vazio.",
    );
  }
  if (protein2Id && !MEALS_WITH_SECOND_PROTEIN.has(selection.mealKey)) {
    return invalid(
      mealKey,
      targets,
      "second_protein_not_allowed",
      "A segunda proteína só vale no café da manhã e no almoço.",
    );
  }

  const chosen: { slot: MealSelectionSlot; id: string }[] = [
    { slot: "carbohydrate", id: selection.carbohydrateId },
  ];
  if (carbohydrate2Id) chosen.push({ slot: "carbohydrate2", id: carbohydrate2Id });
  chosen.push({ slot: "protein", id: selection.proteinId });
  if (protein2Id) chosen.push({ slot: "protein2", id: protein2Id });

  const seen = new Set<string>();
  for (const slot of chosen) {
    if (seen.has(slot.id)) {
      return invalid(
        mealKey,
        targets,
        "duplicate_food",
        "O mesmo alimento não pode ocupar duas posições.",
      );
    }
    seen.add(slot.id);
  }

  const foodCounts = new Map<string, number>();
  for (const food of input.foods) {
    foodCounts.set(food.foodId, (foodCounts.get(food.foodId) ?? 0) + 1);
  }
  const constraintCounts = new Map<string, number>();
  for (const constraint of input.constraints) {
    constraintCounts.set(
      constraint.foodId,
      (constraintCounts.get(constraint.foodId) ?? 0) + 1,
    );
  }

  for (const slot of chosen) {
    if ((foodCounts.get(slot.id) ?? 0) !== 1) {
      return invalid(
        mealKey,
        targets,
        "unknown_food",
        `Alimento ausente ou repetido na ficha: ${slot.id}.`,
      );
    }
    if ((constraintCounts.get(slot.id) ?? 0) !== 1) {
      return invalid(
        mealKey,
        targets,
        "missing_constraint",
        `Restrição de porção ausente ou repetida: ${slot.id}.`,
      );
    }
  }

  const foodsById = new Map(input.foods.map((food) => [food.foodId, food]));
  const constraintsById = new Map(
    input.constraints.map((constraint) => [constraint.foodId, constraint]),
  );

  const missing: Diagnostic[] = [];
  for (const slot of chosen) {
    const food = foodsById.get(slot.id)!;
    if (!Number.isFinite(food.caloriesPer100g) || food.caloriesPer100g < 0) {
      missing.push(
        diagnostic(
          "invalid_nutrient",
          `Calorias inválidas em ${slot.id}.`,
        ),
      );
    }
    const fields: {
      value: number | null;
      label: string;
    }[] = [
      { value: food.proteinPer100g, label: "proteína" },
      { value: food.carbohydratePer100g, label: "carboidrato" },
      { value: food.fatPer100g, label: "gordura" },
    ];
    for (const field of fields) {
      if (field.value === null) {
        missing.push(
          diagnostic(
            "missing_nutrient",
            `Falta ${field.label} em ${slot.id}.`,
          ),
        );
      } else if (!Number.isFinite(field.value) || field.value < 0) {
        missing.push(
          diagnostic(
            "invalid_nutrient",
            `${field.label} com valor inválido em ${slot.id}.`,
          ),
        );
      }
    }
    if (food.carbohydrateBasis !== "available") {
      missing.push(
        diagnostic(
          "carbohydrate_basis",
          `Base de carboidrato de ${slot.id} não está normalizada como disponível.`,
        ),
      );
    }
  }
  if (missing.length > 0) {
    return finish(mealKey, "missing_nutrition", targets, [], missing);
  }

  if (!Number.isFinite(targets.calories) || targets.calories <= 0) {
    return finish(mealKey, "energy_budget_exhausted", targets, [], [
      diagnostic(
        "energy_budget_exhausted",
        "Não há saldo energético positivo para calcular porções.",
      ),
    ]);
  }
  if (
    !Number.isFinite(targets.proteinGrams) ||
    targets.proteinGrams < 0 ||
    !Number.isFinite(targets.carbohydrateGrams) ||
    targets.carbohydrateGrams < 0 ||
    !Number.isFinite(targets.fatGrams) ||
    targets.fatGrams < 0
  ) {
    return invalid(
      mealKey,
      targets,
      "invalid_target",
      "Meta de macronutriente inválida.",
    );
  }

  const tolerances = [
    portionTolerance("energy", targets.calories),
    portionTolerance("protein", targets.proteinGrams),
    portionTolerance("carbohydrate", targets.carbohydrateGrams),
    portionTolerance("fat", targets.fatGrams),
  ];
  const targetVector = [
    targets.calories,
    targets.proteinGrams,
    targets.carbohydrateGrams,
    targets.fatGrams,
  ];

  const axes: Axis[] = [];
  for (const slot of chosen) {
    const food = foodsById.get(slot.id)!;
    const constraint = constraintsById.get(slot.id)!;
    if (
      constraint.unit &&
      (!Number.isFinite(constraint.unit.gramsPerUnit) ||
        constraint.unit.gramsPerUnit <= 0)
    ) {
      return finish(mealKey, "no_valid_portions", targets, [], [
        diagnostic(
          "invalid_constraint",
          `Unidade inválida em ${slot.id}.`,
        ),
      ]);
    }
    const domain = alignment(
      constraint.minimum,
      constraint.maximum,
      constraint.step,
    );
    if (!domain || domain.count === 0) {
      return finish(mealKey, "no_valid_portions", targets, [], [
        diagnostic(
          domain && domain.count === 0
            ? "empty_domain"
            : "invalid_constraint",
          domain && domain.count === 0
            ? `Nenhuma porção válida no passo de ${slot.id}.`
            : `Limites de porção inválidos em ${slot.id}.`,
        ),
      ]);
    }
    const protein = food.proteinPer100g ?? 0;
    const carbohydrate = food.carbohydratePer100g ?? 0;
    const fat = food.fatPer100g ?? 0;
    axes.push({
      slot: slot.slot,
      foodId: slot.id,
      food,
      unit: constraint.unit,
      step: constraint.step,
      firstK: domain.firstK,
      count: domain.count,
      perGram: [
        food.caloriesPer100g / 100,
        protein / 100,
        carbohydrate / 100,
        fat / 100,
      ],
      table: null,
    });
  }

  let product = 1;
  let enumerable = true;
  for (const axis of axes) {
    if (axis.count > MAX_TABLE_STEPS) enumerable = false;
    product *= axis.count;
    if (!Number.isFinite(product) || product > SOLVER_EXHAUSTIVE_LIMIT) {
      enumerable = false;
      break;
    }
  }
  if (enumerable) {
    for (const axis of axes) axis.table = buildTable(axis);
  }

  const picked: { current: Candidate | null } = { current: null };
  const remember = (indices: readonly number[], totals: readonly number[]) => {
    const within = withinTotals(totals, targetVector, tolerances);
    const candidate: Candidate = {
      indices: [...indices],
      totals: [totals[0]!, totals[1]!, totals[2]!, totals[3]!],
      cost: costOf(totals, targetVector, tolerances),
      within,
    };
    if (!picked.current || prefer(candidate, picked.current)) {
      picked.current = candidate;
    }
  };

  const evaluateIndices = (indices: readonly number[]) => {
    const totals = [0, 0, 0, 0];
    for (let index = 0; index < axes.length; index += 1) {
      const part = contribOf(axes[index]!, indices[index]!);
      totals[0] += part[0];
      totals[1] += part[1];
      totals[2] += part[2];
      totals[3] += part[3];
    }
    remember(indices, totals);
  };

  const start = continuousGrams(axes, targetVector, tolerances);
  const snapped = start.map((grams, index) => nearestIndex(axes[index]!, grams));
  const visitNeighbors = (level: number, indices: number[]) => {
    if (level === axes.length) {
      evaluateIndices(indices);
      return;
    }
    const center = snapped[level]!;
    const from = Math.max(0, center - 1);
    const to = Math.min(axes[level]!.count - 1, center + 1);
    for (let index = from; index <= to; index += 1) {
      indices[level] = index;
      visitNeighbors(level + 1, indices);
    }
  };
  visitNeighbors(0, snapped.slice());

  const enumerate = (
    level: number,
    carried: [number, number, number, number],
    indices: number[],
  ) => {
    const axis = axes[level]!;
    const table = axis.table!;
    if (level === axes.length - 1) {
      for (let index = 0; index < axis.count; index += 1) {
        const offset = index * 4;
        indices[level] = index;
        remember(indices, [
          carried[0] + table[offset]!,
          carried[1] + table[offset + 1]!,
          carried[2] + table[offset + 2]!,
          carried[3] + table[offset + 3]!,
        ]);
      }
      return;
    }
    for (let index = 0; index < axis.count; index += 1) {
      const offset = index * 4;
      indices[level] = index;
      enumerate(
        level + 1,
        [
          carried[0] + table[offset]!,
          carried[1] + table[offset + 1]!,
          carried[2] + table[offset + 2]!,
          carried[3] + table[offset + 3]!,
        ],
        indices,
      );
    }
  };

  let inconclusive = false;
  if (enumerable && axes.length === 4) {
    picked.current = exhaustiveFour(axes, targetVector, tolerances);
  } else if (enumerable) {
    enumerate(0, [0, 0, 0, 0], Array<number>(axes.length).fill(0));
  } else {
    const costAt = (indices: readonly number[]): number => {
      const totals = [0, 0, 0, 0];
      for (let index = 0; index < axes.length; index += 1) {
        const part = contribOf(axes[index]!, indices[index]!);
        totals[0] += part[0];
        totals[1] += part[1];
        totals[2] += part[2];
        totals[3] += part[3];
      }
      return costOf(totals, targetVector, tolerances);
    };
    const leftmostMinimum = (prefix: readonly number[]): number[] => {
      const level = prefix.length;
      const count = axes[level]!.count;
      if (level === axes.length - 1) {
        let low = 0;
        let high = count - 1;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          const left = costAt([...prefix, mid]);
          const right = costAt([...prefix, mid + 1]);
          if (right < left - COST_TIE) low = mid + 1;
          else high = mid;
        }
        return [...prefix, low];
      }
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const left = leftmostMinimum([...prefix, mid]);
        const right = leftmostMinimum([...prefix, mid + 1]);
        const leftCost = costAt(left);
        const rightCost = costAt(right);
        if (rightCost < leftCost - COST_TIE) low = mid + 1;
        else if (Math.abs(rightCost - leftCost) <= COST_TIE && lexLess(right, left)) {
          low = mid + 1;
        } else high = mid;
      }
      return leftmostMinimum([...prefix, low]);
    };
    const convex = leftmostMinimum([]);
    let polished = convex.slice();
    let trusted = true;
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
        if (axes[axisIndex]!.count > 4_000) {
          trusted = false;
          continue;
        }
        const before = polished[axisIndex]!;
        let bestIndex = before;
        let bestCost = costAt(polished);
        for (let index = 0; index < axes[axisIndex]!.count; index += 1) {
          polished[axisIndex] = index;
          const nextCost = costAt(polished);
          if (
            nextCost < bestCost - COST_TIE ||
            (Math.abs(nextCost - bestCost) <= COST_TIE && index < bestIndex)
          ) {
            bestCost = nextCost;
            bestIndex = index;
          }
        }
        polished[axisIndex] = bestIndex;
        if (bestIndex !== before) changed = true;
      }
      if (!changed) break;
    }
    if (lexLess(polished, convex) || costAt(polished) < costAt(convex) - COST_TIE) {
      trusted = false;
    }
    evaluateIndices(polished);
    if (
      picked.current &&
      (picked.current.cost < costAt(polished) - COST_TIE ||
        (Math.abs(picked.current.cost - costAt(polished)) <= COST_TIE &&
          lexLess(picked.current.indices, polished)))
    ) {
      trusted = false;
    }

    const bounds = suffixBounds(axes);
    const boxCanMeet = bounds.lo[0]!.every((low, metric) => {
      const high = bounds.hi[0]![metric]!;
      const windowLow = targetVector[metric]! - tolerances[metric]!;
      const windowHigh = targetVector[metric]! + tolerances[metric]!;
      return high >= windowLow - WITHIN_SLACK && low <= windowHigh + WITHIN_SLACK;
    });
    const polishedTotals = [0, 0, 0, 0];
    for (let index = 0; index < axes.length; index += 1) {
      const part = contribOf(axes[index]!, polished[index]!);
      polishedTotals[0] += part[0];
      polishedTotals[1] += part[1];
      polishedTotals[2] += part[2];
      polishedTotals[3] += part[3];
    }
    const polishedWithin = withinTotals(polishedTotals, targetVector, tolerances);

    if (!(trusted && (polishedWithin || !boxCanMeet))) {
      const budget = { ops: 0, incomplete: false };
      let bestWithinCost =
        picked.current?.within === true
          ? picked.current.cost
          : Number.POSITIVE_INFINITY;
      const canMeetFrom = (level: number, partial: readonly number[]): boolean => {
        for (let metric = 0; metric < 4; metric += 1) {
          const low = partial[metric]! + bounds.lo[level]![metric]!;
          const high = partial[metric]! + bounds.hi[level]![metric]!;
          const windowLow = targetVector[metric]! - tolerances[metric]!;
          const windowHigh = targetVector[metric]! + tolerances[metric]!;
          if (high < windowLow - WITHIN_SLACK || low > windowHigh + WITHIN_SLACK) {
            return false;
          }
        }
        return true;
      };
      const lowerCost = (level: number, partial: readonly number[]): number => {
        let cost = 0;
        for (let metric = 0; metric < 4; metric += 1) {
          const low = partial[metric]! + bounds.lo[level]![metric]!;
          const high = partial[metric]! + bounds.hi[level]![metric]!;
          const target = targetVector[metric]!;
          let distance = 0;
          if (target < low) distance = low - target;
          else if (target > high) distance = target - high;
          const error = distance / tolerances[metric]!;
          cost += WEIGHTS[metric]! * error * error;
        }
        return cost;
      };
      const search = (level: number, partial: number[], indices: number[]) => {
        if (budget.incomplete) return;
        budget.ops += 1;
        if (budget.ops > SOLVER_SEARCH_NODE_CAP) {
          budget.incomplete = true;
          return;
        }
        if (!canMeetFrom(level, partial)) return;
        if (lowerCost(level, partial) > bestWithinCost + COST_TIE) return;
        const axis = axes[level]!;
        if (level === axes.length - 1) {
          const range = feasibleIndexRange(axis, partial, targetVector, tolerances);
          if (!range) return;
          let low = 0;
          let high = axis.count - 1;
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const left = add4(partial, contribOf(axis, mid));
            const right = add4(partial, contribOf(axis, mid + 1));
            if (
              costOf(right, targetVector, tolerances) <
              costOf(left, targetVector, tolerances) - COST_TIE
            ) {
              low = mid + 1;
            } else high = mid;
          }
          const chosenIndex = clamp(low, range[0], range[1]);
          const accept = (index: number) => {
            indices[level] = index;
            const totals = add4(partial, contribOf(axis, index));
            if (!withinTotals(totals, targetVector, tolerances)) return;
            remember(indices, totals);
            bestWithinCost = Math.min(
              bestWithinCost,
              costOf(totals, targetVector, tolerances),
            );
          };
          accept(chosenIndex);
          if (!withinTotals(add4(partial, contribOf(axis, chosenIndex)), targetVector, tolerances)) {
            for (let index = range[0]; index <= range[1]; index += 1) {
              budget.ops += 1;
              if (budget.ops > SOLVER_SEARCH_NODE_CAP) {
                budget.incomplete = true;
                return;
              }
              accept(index);
            }
          }
          return;
        }
        const center = clamp(polished[level]!, 0, axis.count - 1);
        const visit = (index: number) => {
          if (budget.incomplete) return;
          indices[level] = index;
          search(level + 1, add4(partial, contribOf(axis, index)), indices);
        };
        visit(center);
        for (let distance = 1; distance < axis.count && !budget.incomplete; distance += 1) {
          if (center - distance >= 0) visit(center - distance);
          if (center + distance < axis.count) visit(center + distance);
        }
      };
      search(0, [0, 0, 0, 0], Array<number>(axes.length).fill(0));
      if (budget.incomplete) inconclusive = true;
      else if (picked.current?.within === true || trusted) inconclusive = false;
      else inconclusive = true;
    }
  }

  if (!picked.current) {
    return finish(mealKey, "search_incomplete", targets, [], [
      diagnostic(
        "search_incomplete",
        "A busca atingiu o limite antes de avaliar uma porção.",
      ),
    ]);
  }

  const portions = portionsFrom(axes, picked.current.indices);
  const recalculated = totalsOfPortions(portions);
  const within = withinTotals(recalculated, targetVector, tolerances);
  const outside = outsideDiagnostics(recalculated, targetVector, tolerances);
  if (inconclusive) {
    return finish(mealKey, "search_incomplete", targets, portions, [
      diagnostic(
        "search_incomplete",
        "A busca atingiu o limite de operações antes de concluir.",
      ),
      ...outside,
    ]);
  }
  if (within) {
    return finish(mealKey, "within_targets", targets, portions, []);
  }
  return finish(
    mealKey,
    "approximate",
    targets,
    portions,
    outside.length > 0
      ? outside
      : [
          diagnostic(
            "outside_tolerance",
            "Alguma meta ficou fora da tolerância.",
          ),
        ],
  );
}

function lexLess(left: readonly number[], right: readonly number[]): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! < right[index]!;
  }
  return false;
}

function add4(
  left: readonly number[],
  right: readonly [number, number, number, number],
): number[] {
  return [
    left[0]! + right[0],
    left[1]! + right[1],
    left[2]! + right[2],
    left[3]! + right[3],
  ];
}

function feasibleIndexRange(
  axis: Axis,
  partial: readonly number[],
  targets: readonly number[],
  tolerances: readonly number[],
): [number, number] | null {
  let low = 0;
  let high = axis.count - 1;
  for (let metric = 0; metric < 4; metric += 1) {
    const density = axis.perGram[metric]!;
    const needLow = targets[metric]! - tolerances[metric]! - partial[metric]!;
    const needHigh = targets[metric]! + tolerances[metric]! - partial[metric]!;
    if (density === 0) {
      if (0 < needLow - WITHIN_SLACK || 0 > needHigh + WITHIN_SLACK) return null;
      continue;
    }
    const gramLow = density > 0 ? needLow / density : needHigh / density;
    const gramHigh = density > 0 ? needHigh / density : needLow / density;
    const first = lowerGramIndex(axis, gramLow - WITHIN_SLACK);
    const last = upperGramIndex(axis, gramHigh + WITHIN_SLACK);
    if (first > last) return null;
    low = Math.max(low, first);
    high = Math.min(high, last);
    if (low > high) return null;
  }
  return [low, high];
}

function lowerGramIndex(axis: Axis, grams: number): number {
  let low = 0;
  let high = axis.count;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (gramsOf(axis, mid) < grams) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperGramIndex(axis: Axis, grams: number): number {
  let low = 0;
  let high = axis.count;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (gramsOf(axis, mid) <= grams) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

function outsideDiagnostics(
  totals: readonly number[],
  targets: readonly number[],
  tolerances: readonly number[],
): Diagnostic[] {
  const labels = ["Energia", "Proteína", "Carboidrato", "Gordura"];
  const diagnostics: Diagnostic[] = [];
  for (let metric = 0; metric < 4; metric += 1) {
    if (Math.abs(totals[metric]! - targets[metric]!) > tolerances[metric]! + WITHIN_SLACK) {
      diagnostics.push(
        diagnostic(
          "outside_tolerance",
          `${labels[metric]} fora da tolerância.`,
        ),
      );
    }
  }
  return diagnostics;
}
