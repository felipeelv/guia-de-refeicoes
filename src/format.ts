import type { PortionCalculationResult } from "./domain/types.ts";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatGrams(value: number): string {
  return `${formatNumber(value)} g`;
}

export function formatMargin(result: PortionCalculationResult): string {
  if (result.toleranceStatus === "within") return "Porções dentro da margem";
  if (result.toleranceStatus === "below") return "Porções um pouco abaixo da margem";
  return "Porções um pouco acima da margem";
}

export const CALCULATION_ERROR_MESSAGE =
  "Não foi possível calcular esta combinação. Escolha novamente.";
