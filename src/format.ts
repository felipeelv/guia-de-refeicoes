import type { PortionCalculationResult } from "./domain/types.ts";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatKcal(value: number): string {
  return `${formatNumber(value)} kcal`;
}

export function formatGrams(value: number): string {
  return `${formatNumber(value)} g`;
}

export function formatDifference(result: PortionCalculationResult): string {
  const margin =
    result.toleranceStatus === "within"
      ? "dentro da margem"
      : result.toleranceStatus === "below"
        ? "abaixo da margem"
        : "acima da margem";
  if (result.differenceCalories === 0) return `Na meta · ${margin}`;
  const direction =
    result.differenceCalories < 0 ? "abaixo da meta" : "acima da meta";
  return `${formatKcal(Math.abs(result.differenceCalories))} ${direction} · ${margin}`;
}

export const CALCULATION_ERROR_MESSAGE =
  "Não foi possível calcular esta combinação. Escolha novamente.";
