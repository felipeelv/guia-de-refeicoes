import type { Food, MealConfig, Person } from "../domain/types.ts";
import { mealConfigError, personConfigError } from "../domain/validation.ts";
import { loadCatalog } from "./catalog.ts";
import type { CatalogData } from "./context.tsx";

const TIMEOUT_MS = 3000;

function parseRemoteCatalog(items: unknown): CatalogData | null {
  if (typeof items !== "object" || items === null) return null;
  const { foods, persons, meals } = items as Record<string, unknown>;
  if (!Array.isArray(foods) || !Array.isArray(persons) || !Array.isArray(meals)) {
    return null;
  }
  const loaded = loadCatalog(foods as Food[]);
  if (loaded.active.length === 0) return null;
  if (import.meta.env?.DEV) {
    for (const problem of loaded.problems) {
      console.warn(`[meal-guide:remoto] ${problem}`);
    }
  }
  const personList = persons as Person[];
  if (personConfigError(personList) !== null) return null;
  const mealList = meals as MealConfig[];
  if (mealConfigError(mealList) !== null) return null;
  return { foods: loaded.active, persons: personList, meals: mealList };
}

export async function fetchRemoteCatalog(): Promise<CatalogData | null> {
  const url = import.meta.env.VITE_GLOBAL_CONFIG_ITEMS as string | undefined;
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseRemoteCatalog(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
