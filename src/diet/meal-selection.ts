import { foodsByCategory } from "../catalog/catalog.ts";
import { SUPPORTED_RESTRICTIONS } from "../domain/types.ts";
import type {
  DietAssessment,
  Food,
  FoodCategory,
  MealKey,
  Person,
  SupportedRestriction,
} from "../domain/types.ts";

export function allowsSecondProtein(mealKey: MealKey): boolean {
  return mealKey === "breakfast" || mealKey === "lunch";
}

export interface ResolvedMealSelection {
  carbohydrateId: string | null;
  carbohydrate2Id: string | null;
  proteinId: string | null;
  protein2Id: string | null;
  rejected: readonly string[];
}

function take(
  id: string | null,
  allowed: ReadonlySet<string>,
  used: Set<string>,
  rejected: string[],
): string | null {
  if (!id) return null;
  if (!allowed.has(id) || used.has(id)) {
    rejected.push(id);
    return null;
  }
  used.add(id);
  return id;
}

/**
 * A URL não fura categoria, refeição, exclusão nem o limite de itens.
 * O mesmo alimento não ocupa dois lugares. protein2 só existe no café e no almoço.
 */
export function resolveMealSelection(input: {
  mealKey: MealKey;
  carb: string | null;
  carb2: string | null;
  protein: string | null;
  protein2: string | null;
  carbohydrates: readonly Food[];
  proteins: readonly Food[];
}): ResolvedMealSelection {
  const rejected: string[] = [];
  const used = new Set<string>();
  const carbIds = new Set(input.carbohydrates.map((food) => food.id));
  const proteinIds = new Set(input.proteins.map((food) => food.id));
  const carbohydrateId = take(input.carb, carbIds, used, rejected);
  const carbohydrate2Id = take(input.carb2, carbIds, used, rejected);
  const proteinId = take(input.protein, proteinIds, used, rejected);
  let protein2Id: string | null = null;
  if (input.protein2) {
    if (!allowsSecondProtein(input.mealKey)) rejected.push(input.protein2);
    else protein2Id = take(input.protein2, proteinIds, used, rejected);
  }
  return { carbohydrateId, carbohydrate2Id, proteinId, protein2Id, rejected };
}

function isSupportedRestriction(value: string): value is SupportedRestriction {
  return (SUPPORTED_RESTRICTIONS as readonly string[]).includes(value);
}

export function foodsForMealSlot(input: {
  category: FoodCategory;
  mealKey: MealKey;
  person: Person;
  foods: readonly Food[];
  assessment: DietAssessment | null;
}): Food[] {
  const tags = [...input.person.excludedTags];
  const preferred = input.assessment?.preferredFoodIds ?? [];
  const avoided = new Set(input.assessment?.avoidedFoodIds ?? []);
  if (input.assessment) {
    for (const tag of input.assessment.avoidedGroups) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  const restrictions =
    input.assessment?.allergies.status === "reported"
      ? input.assessment.allergies.items.filter(isSupportedRestriction)
      : [];
  const list = foodsByCategory(
    input.category,
    input.mealKey,
    tags,
    input.foods,
    restrictions,
  ).filter((food) => !avoided.has(food.id));
  return list.sort((left, right) => {
    const leftRank = preferred.includes(left.id) ? 0 : 1;
    const rightRank = preferred.includes(right.id) ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.sortOrder - right.sortOrder;
  });
}
