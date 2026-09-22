import type { MealConfig, MealKey, Person, PersonKey } from "../domain/types.ts";
import { assertPersonConfigs } from "../domain/validation.ts";
import { MEALS } from "./meals.ts";

function mealsWithTargets(targets: Record<MealKey, number>): MealConfig[] {
  return MEALS.map((meal) => ({ ...meal, targetCalories: targets[meal.key] }));
}

export const PERSONS: Person[] = [
  {
    key: "felipe",
    name: "Felipe",
    dailyCalories: 2000,
    roundingIncrementGrams: 10,
    excludedTags: ["fruit"],
    meals: mealsWithTargets({
      breakfast: 400,
      lunch: 550,
      snack: 300,
      dinner: 550,
      supper: 200,
    }),
  },
  {
    key: "gabriela",
    name: "Ana Gabriela",
    dailyCalories: 1200,
    roundingIncrementGrams: 5,
    excludedTags: [],
    meals: mealsWithTargets({
      breakfast: 240,
      lunch: 330,
      snack: 180,
      dinner: 330,
      supper: 120,
    }),
  },
];

assertPersonConfigs(PERSONS);

export const DEFAULT_PERSON: Person = PERSONS[0]!;

export function personByKey(key: string | undefined): Person | null {
  return PERSONS.find((person) => person.key === key) ?? null;
}

export function isPersonKey(key: string | undefined): key is PersonKey {
  return personByKey(key) !== null;
}
