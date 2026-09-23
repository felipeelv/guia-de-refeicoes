import { createContext, useContext } from "react";
import type { Food, MealConfig, Person } from "../domain/types.ts";
import { foods } from "./catalog.ts";
import { MEALS } from "./meals.ts";
import { PERSONS } from "./persons.ts";

export interface CatalogData {
  foods: Food[];
  persons: Person[];
  meals: MealConfig[];
}

export const bundledCatalog: CatalogData = {
  foods,
  persons: PERSONS,
  meals: MEALS,
};

export const CatalogContext = createContext<CatalogData>(bundledCatalog);

export function useCatalog(): CatalogData {
  return useContext(CatalogContext);
}
