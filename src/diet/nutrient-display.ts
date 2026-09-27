import type { Food, FrozenNutrients, PortionSolutionItem } from "../domain/types.ts";
import { formatKcal } from "../format.ts";

const macroNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Quantidade absoluta, sem sinal. O excesso é uma frase, nunca um número negativo. */
export function formatMagnitude(value: number, unit: "kcal" | "g"): string {
  const abs = Math.abs(value);
  if (unit === "kcal") return formatKcal(Math.round(abs));
  return `${macroNumber.format(abs)} g`;
}

export function formatBalance(value: number, unit: "kcal" | "g"): string {
  if (!Number.isFinite(value)) return "indisponível";
  if (value < 0) return `excesso de ${formatMagnitude(value, unit)}`;
  return formatMagnitude(value, unit);
}

export function freezeFromFood(food: Food, grams: number): FrozenNutrients {
  const scale = grams / 100;
  const known = (value: number | null): number | null =>
    value == null || !Number.isFinite(value) ? null : value * scale;
  return {
    calories: Number.isFinite(food.caloriesPer100g) ? food.caloriesPer100g * scale : null,
    proteinGrams: known(food.proteinPer100g),
    carbohydrateGrams: known(food.carbohydratePer100g),
    fatGrams: known(food.fatPer100g),
  };
}

export function freezeFromSolution(item: PortionSolutionItem): FrozenNutrients {
  return {
    calories: item.calories,
    proteinGrams: item.proteinGrams,
    carbohydrateGrams: item.carbohydrateGrams,
    fatGrams: item.fatGrams,
  };
}

/** Escala o retrato já congelado. Não relê o catálogo. */
export function scaleFrozenNutrients(
  nutrients: FrozenNutrients,
  previousGrams: number,
  nextGrams: number,
): FrozenNutrients {
  if (!(previousGrams > 0) || !Number.isFinite(nextGrams)) return nutrients;
  const ratio = nextGrams / previousGrams;
  const scale = (value: number | null) =>
    value == null || !Number.isFinite(value) ? null : value * ratio;
  return {
    calories: scale(nutrients.calories),
    proteinGrams: scale(nutrients.proteinGrams),
    carbohydrateGrams: scale(nutrients.carbohydrateGrams),
    fatGrams: scale(nutrients.fatGrams),
  };
}

export interface FrozenTotal {
  /** Null quando nenhum valor conhecido entrou na soma. */
  known: number | null;
  partial: boolean;
}

export function frozenNutrientTotal(
  entries: readonly { nutrients: FrozenNutrients }[],
  key: keyof FrozenNutrients,
): FrozenTotal {
  let known = 0;
  let anyKnown = false;
  let partial = false;
  for (const entry of entries) {
    const value = entry.nutrients[key];
    if (value == null || !Number.isFinite(value)) {
      partial = true;
      continue;
    }
    anyKnown = true;
    known += value;
  }
  return { known: anyKnown ? known : null, partial };
}
