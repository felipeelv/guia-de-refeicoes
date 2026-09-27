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

const FOOD_CATEGORIES: readonly FoodCategory[] = ["carbohydrate", "protein"];

export function allowsSecondProtein(mealKey: MealKey): boolean {
  return mealKey === "breakfast" || mealKey === "lunch";
}

export function selectionCap(mealKey: MealKey, category: FoodCategory): number {
  if (category === "carbohydrate") return 2;
  return allowsSecondProtein(mealKey) ? 2 : 1;
}

/**
 * A ordem dos toques define o primeiro e o segundo.
 * Toque num selecionado tira esse alimento. No limite, um toque novo não entra.
 * O mesmo id não ocupa os dois lugares.
 */
export function toggleSlot(
  primary: string | null,
  second: string | null,
  id: string,
  max: number,
): { primary: string | null; second: string | null } {
  const currentSecond = max >= 2 ? second : null;
  if (id === primary) return { primary: currentSecond, second: null };
  if (id === currentSecond) return { primary, second: null };
  const count = (primary ? 1 : 0) + (currentSecond ? 1 : 0);
  if (count >= max) return { primary, second: currentSecond };
  if (!primary) return { primary: id, second: null };
  return { primary, second: id };
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

/**
 * Alimentos que já entram em alguma refeição desta pessoa.
 * Exclusões do perfil e alergias do plano confirmado continuam valendo.
 */
export function foodsEnteringMenu(input: {
  person: Person;
  foods: readonly Food[];
  personalized: boolean;
  assessment: DietAssessment | null;
}): Food[] {
  const seen = new Set<string>();
  const result: Food[] = [];
  for (const meal of input.person.meals) {
    for (const category of FOOD_CATEGORIES) {
      const list = input.personalized
        ? foodsForMealSlot({
            category,
            mealKey: meal.key,
            person: input.person,
            foods: input.foods,
            assessment: input.assessment,
          })
        : foodsByCategory(
            category,
            meal.key,
            input.person.excludedTags,
            input.foods,
          );
      for (const food of list) {
        if (seen.has(food.id)) continue;
        seen.add(food.id);
        result.push(food);
      }
    }
  }
  return result.sort((left, right) => left.sortOrder - right.sortOrder);
}
