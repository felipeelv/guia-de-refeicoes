export type MealKey =
  | "breakfast"
  | "lunch"
  | "snack"
  | "dinner"
  | "supper";

export interface MealConfig {
  key: MealKey;
  label: string;
  targetCalories: number;
  carbohydrateShare: number;
  proteinShare: number;
  order: number;
}

export type FoodCategory = "carbohydrate" | "protein";

export interface FoodSource {
  name: "TBCA" | string;
  code: string;
  url?: string;
  accessedAt: string;
}

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  meals: MealKey[];
  preparation: string;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbohydratePer100g: number | null;
  fatPer100g: number | null;
  source: FoodSource;
  active: boolean;
  sortOrder: number;
}

export interface PortionCalculationInput {
  meal: MealConfig;
  carbohydrateFood: Food;
  secondCarbohydrateFood?: Food | null;
  proteinFood: Food;
  roundingIncrementGrams?: number;
  tolerancePercent?: number;
}

export interface PortionResultItem {
  foodId: string;
  name: string;
  grams: number;
  calories: number;
}

export type ToleranceStatus = "within" | "below" | "above";

export interface PortionCalculationResult {
  mealKey: MealKey;
  targetCalories: number;
  carbohydrate: PortionResultItem;
  secondCarbohydrate: PortionResultItem | null;
  protein: PortionResultItem;
  totalCalories: number;
  differenceCalories: number;
  differencePercent: number;
  toleranceStatus: ToleranceStatus;
}
