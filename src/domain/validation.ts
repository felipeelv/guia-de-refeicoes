import type {
  Food,
  MealConfig,
  Person,
  PortionCalculationInput,
} from "./types.ts";

export class PortionCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortionCalculationError";
  }
}

const SHARE_TOLERANCE = 0.0001;

export function mealConfigError(meals: readonly MealConfig[]): string | null {
  const keys = new Set<string>();
  const orders = new Set<number>();
  for (const meal of meals) {
    if (!(meal.targetCalories > 0) || !Number.isFinite(meal.targetCalories)) {
      return `Meta inválida em ${meal.key}.`;
    }
    if (!(meal.carbohydrateShare > 0) || !(meal.proteinShare > 0)) {
      return `Participação inválida em ${meal.key}.`;
    }
    if (
      Math.abs(meal.carbohydrateShare + meal.proteinShare - 1) > SHARE_TOLERANCE
    ) {
      return `Participações de ${meal.key} não totalizam 1.`;
    }
    if (keys.has(meal.key)) return `Refeição repetida: ${meal.key}.`;
    if (orders.has(meal.order)) return `Ordem repetida: ${meal.order}.`;
    keys.add(meal.key);
    orders.add(meal.order);
  }
  return null;
}

export function assertMealConfigs(meals: readonly MealConfig[]): void {
  const error = mealConfigError(meals);
  if (error) throw new PortionCalculationError(error);
}

export function personConfigError(persons: readonly Person[]): string | null {
  if (persons.length === 0) return "Nenhuma pessoa configurada.";
  const keys = new Set<string>();
  for (const person of persons) {
    if (!person.name.trim()) return `Pessoa sem nome: ${person.key}.`;
    if (keys.has(person.key)) return `Pessoa repetida: ${person.key}.`;
    keys.add(person.key);
    if (!(person.dailyCalories > 0) || !Number.isFinite(person.dailyCalories)) {
      return `Meta diária inválida em ${person.key}.`;
    }
    if (
      !Number.isInteger(person.roundingIncrementGrams) ||
      person.roundingIncrementGrams <= 0
    ) {
      return `Incremento de arredondamento inválido em ${person.key}.`;
    }
    const mealError = mealConfigError(person.meals);
    if (mealError) return `${person.key}: ${mealError}`;
    const total = person.meals.reduce(
      (sum, meal) => sum + meal.targetCalories,
      0,
    );
    if (total !== person.dailyCalories) {
      return `As refeições de ${person.key} somam ${total} kcal, não ${person.dailyCalories}.`;
    }
  }
  return null;
}

export function assertPersonConfigs(persons: readonly Person[]): void {
  const error = personConfigError(persons);
  if (error) throw new PortionCalculationError(error);
}

function foodEnergyError(food: Food, role: string): string | null {
  if (!food.active) return `${role} inativo.`;
  if (!Number.isFinite(food.caloriesPer100g) || food.caloriesPer100g <= 0) {
    return `${role} sem calorias por 100 g válidas.`;
  }
  return null;
}

export function validateInput(input: PortionCalculationInput): void {
  if (!input.meal) throw new PortionCalculationError("Refeição ausente.");
  const mealError = mealConfigError([input.meal]);
  if (mealError) throw new PortionCalculationError(mealError);
  if (!input.carbohydrateFood || !input.proteinFood) {
    throw new PortionCalculationError("Alimento ausente.");
  }
  if (input.carbohydrateFood.category !== "carbohydrate") {
    throw new PortionCalculationError("O carboidrato está na categoria errada.");
  }
  if (input.secondCarbohydrateFood) {
    if (input.secondCarbohydrateFood.category !== "carbohydrate") {
      throw new PortionCalculationError(
        "O segundo carboidrato está na categoria errada.",
      );
    }
    if (input.secondCarbohydrateFood.id === input.carbohydrateFood.id) {
      throw new PortionCalculationError("Os dois carboidratos são iguais.");
    }
  }
  if (input.proteinFood.category !== "protein") {
    throw new PortionCalculationError("A proteína está na categoria errada.");
  }
  const carbohydrateEnergy = foodEnergyError(
    input.carbohydrateFood,
    "Carboidrato",
  );
  if (carbohydrateEnergy) throw new PortionCalculationError(carbohydrateEnergy);
  if (input.secondCarbohydrateFood) {
    const secondEnergy = foodEnergyError(
      input.secondCarbohydrateFood,
      "Segundo carboidrato",
    );
    if (secondEnergy) throw new PortionCalculationError(secondEnergy);
  }
  const proteinEnergy = foodEnergyError(input.proteinFood, "Proteína");
  if (proteinEnergy) throw new PortionCalculationError(proteinEnergy);
  const increment = input.roundingIncrementGrams ?? 10;
  if (!Number.isInteger(increment) || increment <= 0) {
    throw new PortionCalculationError("Incremento de arredondamento inválido.");
  }
  if (
    input.tolerancePercent !== undefined &&
    (!Number.isFinite(input.tolerancePercent) || input.tolerancePercent < 0)
  ) {
    throw new PortionCalculationError("Tolerância inválida.");
  }
}
