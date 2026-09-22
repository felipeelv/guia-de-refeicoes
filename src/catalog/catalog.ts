import type { Food, FoodCategory, FoodTag, MealKey } from "../domain/types.ts";
import rawFoods from "./foods.json" with { type: "json" };

const RAW_WORD = /\bcru(?:a|o|as|os)?\b/i;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = new Set<FoodCategory>(["carbohydrate", "protein"]);
const MEAL_KEYS = new Set<MealKey>([
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "supper",
]);
const TAGS = new Set<FoodTag>(["fruit"]);

export function catalogIssue(food: Food): string | null {
  if (!ID_PATTERN.test(food.id)) return `Id inválido: ${food.id}.`;
  if (!food.name.trim()) return `Nome ausente em ${food.id}.`;
  if (!food.preparation.trim()) return `Preparo ausente em ${food.id}.`;
  if (RAW_WORD.test(food.preparation) || RAW_WORD.test(food.name)) {
    return `${food.id} está cru e não pode ser tratado como pronto.`;
  }
  if (!CATEGORIES.has(food.category)) return `Categoria inválida em ${food.id}.`;
  if (!Array.isArray(food.meals) || food.meals.length === 0) {
    return `${food.id} não está em nenhuma refeição.`;
  }
  for (const meal of food.meals) {
    if (!MEAL_KEYS.has(meal)) return `Refeição inválida em ${food.id}: ${meal}.`;
  }
  if (food.tags !== undefined) {
    if (!Array.isArray(food.tags)) return `Tags inválidas em ${food.id}.`;
    for (const tag of food.tags) {
      if (!TAGS.has(tag)) return `Tag inválida em ${food.id}: ${tag}.`;
    }
  }
  if (!Number.isFinite(food.caloriesPer100g) || food.caloriesPer100g <= 0) {
    return `Calorias inválidas em ${food.id}.`;
  }
  if (!food.source?.name?.trim() || !food.source.code?.trim()) {
    return `Fonte ausente em ${food.id}.`;
  }
  if (!ISO_DATE.test(food.source.accessedAt)) {
    return `Data de acesso inválida em ${food.id}.`;
  }
  return null;
}

export function loadCatalog(records: readonly Food[]): {
  active: Food[];
  problems: string[];
} {
  const problems: string[] = [];
  const active: Food[] = [];
  for (const food of records) {
    const issue = catalogIssue(food);
    if (issue) problems.push(issue);
    if (!issue && food.active) active.push(food);
  }
  return {
    active: active.sort((a, b) => a.sortOrder - b.sortOrder),
    problems,
  };
}

const loaded = loadCatalog(rawFoods as Food[]);

if (import.meta.env?.DEV) {
  for (const problem of loaded.problems) {
    console.warn(`[meal-guide] ${problem}`);
  }
}

export const foods = loaded.active;

export function foodsByCategory(
  category: FoodCategory,
  meal: MealKey,
  excludedTags: readonly FoodTag[] = [],
): Food[] {
  return foods.filter(
    (food) =>
      food.category === category &&
      food.meals.includes(meal) &&
      !(food.tags ?? []).some((tag) => excludedTags.includes(tag)),
  );
}
