import assert from "node:assert/strict";
import test from "node:test";
import { foods } from "../src/catalog/catalog.ts";
import { personByKey } from "../src/catalog/persons.ts";
import { calculatePortions } from "../src/domain/calculate-portions.ts";
import { applyDayEntries } from "../src/diet/plan-activation.ts";
import { SOLUTION_STATE_LABEL } from "../src/diet/copy.ts";
import { buildDayView } from "../src/diet/day-view.ts";
import {
  emptyDietForm,
  initialDietForm,
  writeDietDraft,
  type DietFormState,
} from "../src/diet/draft-form.ts";
import { allowsSecondProtein, resolveMealSelection } from "../src/diet/meal-selection.ts";
import { migrateProfileV1, type MigrationFood } from "../src/diet/migrate-v1.ts";
import { formatBalance, freezeFromFood } from "../src/diet/nutrient-display.ts";
import { saoPauloCalendarDate, type ProfileStorage } from "../src/diet/profile-store.ts";
import { CATALOG_VERSION, foodNutritionForSolver } from "../src/diet/solver-input.ts";
import type { Food, LogEntryV2 } from "../src/domain/types.ts";

class MemoryStorage implements ProfileStorage {
  private readonly values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  keys(): Iterable<string> {
    return this.values.keys();
  }
}

class MemoryDraft {
  private readonly values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
}

function foodById(id: string): Food {
  const food = foods.find((item) => item.id === id);
  assert.ok(food, id);
  return food;
}

test("a seleção da URL não fura categoria, duplicata nem segunda proteína fora do café e do almoço", () => {
  const carbohydrates = [foodById("arroz-branco"), foodById("feijao-carioca")];
  const proteins = [foodById("peito-de-frango"), foodById("ovo")];
  const lunch = resolveMealSelection({
    mealKey: "lunch",
    carb: "peito-de-frango",
    carb2: "arroz-branco",
    protein: "arroz-branco",
    protein2: "peito-de-frango",
    carbohydrates,
    proteins,
  });
  assert.equal(lunch.carbohydrateId, null);
  assert.equal(lunch.carbohydrate2Id, "arroz-branco");
  assert.equal(lunch.proteinId, null);
  assert.equal(lunch.protein2Id, "peito-de-frango");
  assert.deepEqual(lunch.rejected, ["peito-de-frango", "arroz-branco"]);

  const duplicated = resolveMealSelection({
    mealKey: "breakfast",
    carb: "arroz-branco",
    carb2: "arroz-branco",
    protein: "ovo",
    protein2: "ovo",
    carbohydrates,
    proteins,
  });
  assert.equal(duplicated.carbohydrateId, "arroz-branco");
  assert.equal(duplicated.carbohydrate2Id, null);
  assert.equal(duplicated.proteinId, "ovo");
  assert.equal(duplicated.protein2Id, null);

  const dinner = resolveMealSelection({
    mealKey: "dinner",
    carb: "arroz-branco",
    carb2: null,
    protein: "peito-de-frango",
    protein2: "ovo",
    carbohydrates,
    proteins,
  });
  assert.equal(dinner.protein2Id, null);
  assert.deepEqual(dinner.rejected, ["ovo"]);
  assert.equal(allowsSecondProtein("dinner"), false);
  assert.equal(allowsSecondProtein("lunch"), true);
});

test("o solver não transforma gordura desconhecida em zero e usa o carboidrato disponível", () => {
  const apple = foodNutritionForSolver(foodById("maca"));
  assert.equal(apple.fatPer100g, null);
  assert.equal(apple.carbohydratePer100g, 13.8);
  assert.equal(apple.carbohydrateBasis, "available");
  const rice = foodNutritionForSolver(foodById("arroz-branco"));
  assert.equal(rice.carbohydratePer100g, 28.8);
  assert.equal(rice.carbohydrateBasis, "available");
  assert.equal(rice.fatPer100g, 0.41);
});

test("os rótulos do solver usam as frases combinadas", () => {
  assert.equal(SOLUTION_STATE_LABEL.within_targets, "Combinação dentro das metas calculadas");
  assert.equal(SOLUTION_STATE_LABEL.approximate, "Esta combinação precisa de ajuste");
  assert.equal(
    SOLUTION_STATE_LABEL.search_incomplete,
    "Foi encontrada uma aproximação; o ajuste não foi concluído",
  );
});

test("o saldo negativo vira excesso e nunca um grama com sinal de menos", () => {
  const text = formatBalance(-12.5, "g");
  assert.match(text, /excesso de 12,5 g/);
  assert.equal(text.includes("-"), false);
  assert.equal(formatBalance(0, "kcal"), "0 kcal");
});

test("o rascunho de uma pessoa não preenche a outra", () => {
  const felipe = personByKey("felipe");
  const gabriela = personByKey("gabriela");
  assert.ok(felipe && gabriela);
  const storage = new MemoryDraft();
  const form: DietFormState = { ...emptyDietForm(felipe), ageYears: "35", weightKg: "80" };
  writeDietDraft(storage, felipe.key, form);
  const other = initialDietForm(storage, gabriela, null);
  assert.equal(other.ageYears, "");
  assert.equal(other.weightKg, "");
  assert.equal(other.equationCoefficient, "");
  const same = initialDietForm(storage, felipe, null);
  assert.equal(same.ageYears, "35");
});

test("500 g de arroz no almoço legado deixam o jantar em 160 g e o retrato não muda com o catálogo", () => {
  const person = personByKey("felipe");
  assert.ok(person);
  const storage = new MemoryStorage();
  const foodsById = new Map<string, MigrationFood>(
    foods.map((food) => [
      food.id,
      {
        name: food.name,
        preparation: food.preparation,
        caloriesPer100g: food.caloriesPer100g,
        proteinPer100g: food.proteinPer100g,
        carbohydratePer100g: food.carbohydratePer100g,
        fatPer100g: food.fatPer100g,
        source: food.source,
      },
    ]),
  );
  const now = new Date("2026-09-27T15:00:00Z");
  const migrated = migrateProfileV1({
    storage,
    personKey: person.key,
    now,
    foodsById,
    dailyCalories: person.dailyCalories,
    meals: person.meals.map((meal) => ({ mealKey: meal.key, calories: meal.targetCalories })),
    catalogVersion: CATALOG_VERSION,
  });
  assert.equal(migrated.ok, true);
  assert.ok(migrated.profile);
  const today = saoPauloCalendarDate(now);
  const rice = foodById("arroz-branco");
  const chicken = foodById("peito-de-frango");
  const frozen = freezeFromFood(rice, 500);
  assert.equal(frozen.calories, 655);
  const apple = freezeFromFood(foodById("maca"), 100);
  assert.equal(apple.fatGrams, null);
  assert.notEqual(apple.fatGrams, 0);
  const entry: LogEntryV2 = {
    id: "arroz-500",
    batchId: "lote-1",
    personKey: person.key,
    date: today,
    mealKey: "lunch",
    foodId: rice.id,
    foodName: rice.name,
    preparation: rice.preparation,
    grams: 500,
    units: null,
    nutrients: frozen,
    source: rice.source,
    foodVersion: `${rice.source.code}@${rice.source.accessedAt}`,
    dayPlanId: migrated.profile.plans[0]?.id ?? null,
    createdAt: now.toISOString(),
  };
  const withEntry = applyDayEntries(migrated.profile, today, [entry], now);
  const view = buildDayView(person, withEntry, today);
  assert.equal(view.macroTargetsConfigured, false);
  assert.equal(view.summary.consumed.calories, 655);
  assert.equal(view.energyNotice, null);
  const dinner = view.operationalMeals.find((meal) => meal.key === "dinner");
  assert.ok(dinner);
  const portions = calculatePortions({
    meal: dinner,
    carbohydrateFood: rice,
    proteinFood: chicken,
    roundingIncrementGrams: person.roundingIncrementGrams,
  });
  assert.equal(portions.carbohydrate.grams, 160);

  const quiet = buildDayView(person, migrated.profile, today);
  const lunch = quiet.operationalMeals.find((meal) => meal.key === "lunch");
  assert.ok(lunch);
  const untouched = calculatePortions({
    meal: lunch,
    carbohydrateFood: rice,
    proteinFood: chicken,
    roundingIncrementGrams: person.roundingIncrementGrams,
  });
  assert.equal(untouched.carbohydrate.grams, 170);
  assert.equal(untouched.protein.grams, 220);
});
