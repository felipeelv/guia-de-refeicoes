import {
  carbohydrateForMacroOptimization,
  macroOptimizationIssue,
  portionDomain,
} from "../catalog/catalog.ts";
import type {
  Food,
  FoodNutritionV2,
  MealSelection,
  NutritionTargets,
  PortionConstraints,
  SolveMealPortionsInput,
} from "../domain/types.ts";

export const CATALOG_VERSION = "bundled";

/**
 * O número de carboidrato do solver vem de carbohydrateForMacroOptimization.
 * Null permanece null. Gordura desconhecida não vira zero.
 * A base "available" só é declarada quando esse número existe.
 */
export function foodNutritionForSolver(food: Food): FoodNutritionV2 {
  const carbohydrate = carbohydrateForMacroOptimization(food);
  return {
    foodId: food.id,
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbohydratePer100g: carbohydrate,
    fatPer100g: food.fatPer100g,
    carbohydrateBasis:
      carbohydrate === null ? (food.carbohydrateBasis ?? "unspecified") : "available",
    preparation: food.preparation,
    source: food.source,
    version: `${food.source.code}@${food.source.accessedAt}`,
  };
}

/**
 * portionDomain devolve unidades quando o alimento tem unidade.
 * O solver espera gramas no mínimo, no máximo e no passo.
 */
export function solverConstraint(
  food: Food,
  roundingIncrementGrams: number,
): PortionConstraints | null {
  const domain = portionDomain(food, roundingIncrementGrams);
  if (!domain.ok) return null;
  if (!food.unit) return domain.constraints;
  const grams = food.unit.gramsPerUnit;
  return {
    foodId: food.id,
    minimum: domain.constraints.minimum * grams,
    maximum: domain.constraints.maximum * grams,
    step: domain.constraints.step * grams,
    unit: food.unit,
  };
}

export function buildSolveMealInput(input: {
  selection: MealSelection;
  foods: readonly Food[];
  targets: NutritionTargets;
  roundingIncrementGrams: number;
}): { request: SolveMealPortionsInput; reasons: readonly string[] } {
  const reasons: string[] = [];
  const constraints: PortionConstraints[] = [];
  for (const food of input.foods) {
    const issue = macroOptimizationIssue(food, input.roundingIncrementGrams);
    if (issue) reasons.push(issue);
    const constraint = solverConstraint(food, input.roundingIncrementGrams);
    if (!constraint) {
      reasons.push(`Limites de porção indisponíveis em ${food.id}.`);
      continue;
    }
    constraints.push(constraint);
  }
  return {
    reasons,
    request: {
      selection: input.selection,
      targets: input.targets,
      foods: input.foods.map(foodNutritionForSolver),
      constraints,
      policyId: "experimental-v1",
    },
  };
}
