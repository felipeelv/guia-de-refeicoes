export function roundToIncrement(value: number, increment: number): number {
  const rounded = Math.round(value / increment) * increment;
  if (value > 0 && rounded === 0) return increment;
  return rounded;
}

export function roundDisplay(value: number): number {
  return Math.round(value);
}

export function caloriesForPortion(
  caloriesPer100g: number,
  grams: number,
): number {
  return (grams * caloriesPer100g) / 100;
}
