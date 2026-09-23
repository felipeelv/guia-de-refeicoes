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
      className="grid gap-3 rounded-3xl border border-guide-line bg-guide-card p-4 shadow-card"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-xs font-bold tracking-[0.18em] text-guide-muted uppercase">
          Refeição
        </legend>
        <div className="flex flex-wrap gap-2">
          {mealsInOrder(person.meals).map((meal) => (
            <label
              key={meal.key}
              className="relative cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold transition-[border-color,background-color,color] duration-150 has-checked:border-guide-accent has-checked:bg-guide-accent has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-guide-focus has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-guide-card border-guide-line bg-guide-paper text-guide-muted hover:border-guide-accent/60"
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
      <label className="grid gap-1 text-sm font-bold">
        Alimento
        <select
          value={foodId}
          onChange={(event) => setFoodId(event.target.value)}
          className="min-h-12 w-full cursor-pointer rounded-2xl border border-guide-line bg-guide-paper px-3 font-sans font-normal text-guide-ink"
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
          <span className="text-sm font-bold">Quantidade</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Diminuir"
              disabled={unitsValue <= unitStep}
              onClick={() => setUnitsValue((current) => current - unitStep)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-guide-line bg-guide-paper text-xl font-bold text-guide-ink transition-colors duration-150 hover:border-guide-accent/60 disabled:cursor-default disabled:opacity-40"
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
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-guide-line bg-guide-paper text-xl font-bold text-guide-ink transition-colors duration-150 hover:border-guide-accent/60"
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <label className="grid gap-1 text-sm font-bold">
          Quantidade em gramas
          <input
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            value={gramsText}
            onChange={(event) => setGramsText(event.target.value)}
            placeholder="Ex.: 150"
            className="min-h-12 w-full rounded-2xl border border-guide-line bg-guide-paper px-3 font-sans font-normal text-guide-ink tabular-nums"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={!valid}
        className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-guide-accent px-4 font-bold text-white transition-[background-color,transform] duration-150 hover:bg-guide-focus active:scale-[0.99] disabled:cursor-default disabled:opacity-40"
      >
        Adicionar
      </button>
    </form>
  );
}
