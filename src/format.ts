import type {
  FoodUnit,
  PortionCalculationResult,
  PortionResultItem,
} from "./domain/types.ts";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const unitNumberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatGrams(value: number): string {
  return `${formatNumber(value)} g`;
}

export function formatUnits(units: number, unit: FoodUnit): string {
  const whole = Math.floor(units + 1e-9);
  const rest = units - whole;
  const isHalf = Math.abs(rest - 0.5) < 1e-9;
  if (isHalf) {
    if (whole === 0) return `½ ${unit.singular}`;
    return `${formatNumber(whole)} ${whole === 1 ? unit.singular : unit.plural} e ½`;
  }
  if (rest > 1e-9) return `${unitNumberFormat.format(units)} ${unit.plural}`;
  return `${formatNumber(whole)} ${whole === 1 ? unit.singular : unit.plural}`;
}

export function formatPortion(item: PortionResultItem): string {
  if (item.unit && item.units !== null) {
    return formatUnits(item.units, item.unit);
  }
  return formatGrams(item.grams);
}

export function formatPortionDetail(item: PortionResultItem): string | null {
  if (item.unit && item.units !== null) return formatGrams(item.grams);
  return null;
}

export function formatMargin(result: PortionCalculationResult): string {
  if (result.toleranceStatus === "within") return "Porções dentro da margem";
  if (result.toleranceStatus === "below") return "Porções um pouco abaixo da margem";
  return "Porções um pouco acima da margem";
}

export const CALCULATION_ERROR_MESSAGE =
  "Não foi possível calcular esta combinação. Escolha novamente.";
