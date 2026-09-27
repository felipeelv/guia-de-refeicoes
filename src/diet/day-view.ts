import { MEAL_KEYS } from "../domain/nutrition/distribute-targets.ts";
import { rebalanceRemainingMeals } from "../domain/nutrition/rebalance-targets.ts";
import { summarizeDay } from "../domain/nutrition/summarize-nutrition.ts";
import type {
  DayNutritionSummary,
  DietPlan,
  LogEntryV2,
  MealConfig,
  MealNutritionTarget,
  NutritionTargets,
  Person,
  ProfileStoreV2,
  RebalanceResult,
} from "../domain/types.ts";
import { DAY_ENERGY_NOTICE_CODES } from "./copy.ts";
import {
  dayState,
  effectivePlan,
  makeDaySnapshot,
} from "./plan-activation.ts";

export interface DayView {
  effective: DietPlan | null;
  entries: readonly LogEntryV2[];
  summary: DayNutritionSummary;
  rebalance: RebalanceResult | null;
  operationalMeals: MealConfig[];
  mealTargets: readonly MealNutritionTarget[];
  energyNotice: string | null;
  macroTargetsConfigured: boolean;
  baseDaily: NutritionTargets;
}

function legacyTargets(person: Person): {
  daily: NutritionTargets;
  meals: MealNutritionTarget[];
} {
  return {
    daily: {
      calories: person.dailyCalories,
      proteinGrams: 0,
      carbohydrateGrams: 0,
      fatGrams: 0,
    },
    meals: person.meals.map((meal) => ({
      mealKey: meal.key,
      share: person.dailyCalories > 0 ? meal.targetCalories / person.dailyCalories : 0,
      calories: meal.targetCalories,
      proteinGrams: 0,
      carbohydrateGrams: 0,
      fatGrams: 0,
    })),
  };
}

export function buildDayView(person: Person, profile: ProfileStoreV2, today: string): DayView {
  const effective = effectivePlan(profile, today);
  const day = dayState(profile, today);
  const entries = day?.entries ?? [];
  const plan = day?.snapshot?.plan ?? effective;
  const fallback = legacyTargets(person);
  const baseDaily = day?.snapshot?.baseDaily ?? plan?.daily ?? fallback.daily;
  const baseMeals = day?.snapshot?.baseMeals ?? plan?.meals ?? fallback.meals;
  const macroTargetsConfigured = plan?.origin === "confirmed";
  const summary = summarizeDay({
    personKey: person.key,
    date: today,
    entries,
    baseDaily,
    mealKeys: MEAL_KEYS,
    macroTargetsConfigured,
  });
  const snapshot =
    day?.snapshot ?? (plan ? makeDaySnapshot(plan, today, null) : null);
  const rebalance = snapshot
    ? rebalanceRemainingMeals(snapshot, summary, "experimental-v1")
    : null;
  const mealTargets = rebalance?.mealTargets ?? baseMeals;
  const operationalMeals = person.meals.map((meal) => {
    const target = mealTargets.find((item) => item.mealKey === meal.key);
    if (!target || !Number.isFinite(target.calories)) return meal;
    return { ...meal, targetCalories: target.calories };
  });
  const energyNotice =
    rebalance?.diagnostics.find((item) =>
      (DAY_ENERGY_NOTICE_CODES as readonly string[]).includes(item.code),
    )?.message ?? null;
  return {
    effective,
    entries,
    summary,
    rebalance,
    operationalMeals,
    mealTargets,
    energyNotice,
    macroTargetsConfigured,
    baseDaily,
  };
}
