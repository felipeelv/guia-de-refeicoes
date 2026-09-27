import type { Food } from "../domain/types.ts";
import { loadCatalog } from "./catalog.ts";
import rawLibrary from "./library.json" with { type: "json" };

const loaded = loadCatalog(rawLibrary as Food[]);

if (import.meta.env?.DEV) {
  for (const problem of loaded.problems) {
    console.warn(`[meal-guide:biblioteca] ${problem}`);
  }
}

/** Biblioteca extra. Não entra no cardápio até ser salva no envelope da pessoa. */
export const libraryFoods = loaded.active;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Busca por nome na biblioteca. Consulta vazia não lista o acervo inteiro. */
export function searchLibrary(
  query: string,
  source: readonly Food[] = libraryFoods,
): Food[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  return source.filter((food) => fold(food.name).includes(needle));
}

/**
 * Junta o catálogo base com os alimentos salvos desta pessoa.
 * O mesmo id não entra duas vezes. Outra pessoa não herda a lista.
 */
export function catalogWithSaved(
  base: readonly Food[],
  savedFoodIds: readonly string[],
  library: readonly Food[] = libraryFoods,
): Food[] {
  const known = new Set(base.map((food) => food.id));
  const wanted = new Set(savedFoodIds);
  const extras = library.filter((food) => wanted.has(food.id) && !known.has(food.id));
  return [...base, ...extras];
}
