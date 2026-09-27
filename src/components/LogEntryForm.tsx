import { useMemo, useState, type FormEvent } from "react";
import { useCatalog } from "../catalog/context.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import { formatGrams, formatUnits } from "../format.ts";
import { useLog } from "./LogContext.tsx";
import type { MealKey, Person } from "../domain/types.ts";

export function LogEntryForm({ person }: { person: Person }) {
  const { foods } = useCatalog();
  const { addEntry } = useLog();
  const [mealKey, setMealKey] = useState<MealKey>("lunch");
  const [foodId, setFoodId] = useState("");
  const [gramsText, setGramsText] = useState("");
  const [unitsValue, setUnitsValue] = useState(1);

  const mealFoods = useMemo(
    () =>
      foods.filter(
        (food) =>
          food.meals.includes(mealKey) &&
          !(food.tags ?? []).some((tag) => person.excludedTags.includes(tag)),
      ),
    [foods, mealKey, person],
  );
  const food = mealFoods.find((option) => option.id === foodId) ?? null;
  const unitStep = food?.unit?.stepUnits ?? 1;
  const grams = food?.unit
    ? unitsValue * food.unit.gramsPerUnit
    : Number(gramsText);
  const valid = food !== null && Number.isFinite(grams) && grams > 0;

  function chooseMeal(next: MealKey) {
    setMealKey(next);
    setFoodId("");
    setGramsText("");
    setUnitsValue(1);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !food) return;
    addEntry({ foodId: food.id, grams, mealKey });
    setFoodId("");
    setGramsText("");
    setUnitsValue(1);
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-card bg-guide-card p-5 shadow-card"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-3 text-lg font-medium text-guide-ink">
          Refeição
        </legend>
        <div className="flex flex-wrap gap-2">
          {mealsInOrder(person.meals).map((meal) => (
            <label
              key={meal.key}
              className="relative cursor-pointer rounded-card bg-guide-chip px-4 py-2 text-sm text-guide-accent-ink transition-[background-color,color] duration-150 hover:bg-guide-line has-checked:bg-guide-accent has-checked:font-medium has-checked:text-guide-ink has-focus-visible:ring-2 has-focus-visible:ring-guide-focus has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-guide-card"
            >
              <input
                type="radio"
                name="diary-meal"
                value={meal.key}
                checked={mealKey === meal.key}
                onChange={() => chooseMeal(meal.key)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              {meal.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1.5 text-sm text-guide-body">
        Alimento
        <select
          value={foodId}
          onChange={(event) => setFoodId(event.target.value)}
          className="min-h-[50px] w-full cursor-pointer rounded-card border-0 bg-guide-paper px-4 font-sans text-base text-guide-ink"
        >
          <option value="">Escolha o alimento</option>
          {mealFoods.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {food?.unit ? (
        <div className="grid gap-1">
          <span className="text-sm text-guide-body">Quantidade</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Diminuir"
              disabled={unitsValue <= unitStep}
              onClick={() => setUnitsValue((current) => current - unitStep)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-guide-line text-xl font-bold text-guide-ink transition-colors duration-150 hover:bg-guide-chip disabled:cursor-default disabled:opacity-40"
            >
              −
            </button>
            <p className="m-0 min-w-24 text-center">
              <span className="font-display text-xl tabular-nums">
                {formatUnits(unitsValue, food.unit)}
              </span>
              <span className="block text-sm text-guide-muted tabular-nums">
                {formatGrams(grams)}
              </span>
            </p>
            <button
              type="button"
              aria-label="Aumentar"
              onClick={() => setUnitsValue((current) => current + unitStep)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-guide-line text-xl font-bold text-guide-ink transition-colors duration-150 hover:bg-guide-chip"
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <label className="grid gap-1.5 text-sm text-guide-body">
          Quantidade em gramas
          <input
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            value={gramsText}
            onChange={(event) => setGramsText(event.target.value)}
            placeholder="Ex.: 150"
            className="min-h-[50px] w-full rounded-card border-0 bg-guide-paper px-4 font-sans text-base text-guide-ink tabular-nums"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={!valid}
        className="inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-card border-0 bg-guide-primary px-4 font-bold text-white transition-[background-color,transform] duration-150 hover:bg-guide-primary-hover active:scale-[0.99] disabled:cursor-default disabled:opacity-40"
      >
        Adicionar
      </button>
    </form>
  );
}
