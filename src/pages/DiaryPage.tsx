import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import { LogEntryForm } from "../components/LogEntryForm.tsx";
import { useLog } from "../components/LogContext.tsx";
import { entryCalories } from "../domain/day-log.ts";
import type { Person } from "../domain/types.ts";
import { formatGrams, formatKcal, formatUnits } from "../format.ts";

export function DiaryPage() {
  const person = useOutletContext<Person>();
  const { foods } = useCatalog();
  const { entries, removeEntry, totalKcal } = useLog();
  const foodsById = useMemo(
    () => new Map(foods.map((food) => [food.id, food])),
    [foods],
  );
  const percent =
    person.dailyCalories > 0
      ? Math.min(100, Math.round((totalKcal / person.dailyCalories) * 100))
      : 0;
  const over = totalKcal > person.dailyCalories;
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto grid w-full max-w-md content-start gap-6 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="grid gap-2">
        <p className="m-0 text-xs font-bold tracking-[0.2em] text-guide-accent uppercase">
          Registro do dia
        </p>
        <h1 className="font-display m-0 text-4xl leading-tight text-pretty">
          Diário de {person.name}
        </h1>
        <p className="m-0 text-guide-muted first-letter:uppercase">{today}</p>
      </header>

      <section className="grid gap-3 rounded-3xl border border-guide-line bg-guide-card p-4 shadow-card">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-bold tracking-[0.16em] text-guide-muted uppercase">
              Consumido hoje
            </p>
            <p className="m-0 font-display text-4xl leading-none tabular-nums">
              {formatKcal(totalKcal)}
            </p>
          </div>
          <p className="m-0 text-sm text-guide-muted tabular-nums">
            de {formatKcal(person.dailyCalories)}
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-guide-line/70">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              over ? "bg-guide-accent" : "bg-guide-success"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <ul className="m-0 grid list-none gap-1 p-0">
          {mealsInOrder(person.meals).map((meal) => {
            const consumed = Math.round(
              entries
                .filter((entry) => entry.mealKey === meal.key)
                .reduce((sum, entry) => sum + entryCalories(entry, foodsById), 0),
            );
            return (
              <li
                key={meal.key}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-guide-muted">{meal.label}</span>
                <span className="tabular-nums">
                  {formatKcal(consumed)}
                  <span className="text-guide-muted">
                    {" "}
                    / {formatKcal(meal.targetCalories)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <LogEntryForm person={person} />

      {entries.length === 0 ? (
        <p className="m-0 rounded-3xl border border-dashed border-guide-line bg-guide-card/60 p-4 text-guide-muted">
          Nada registrado ainda.
        </p>
      ) : (
        mealsInOrder(person.meals).map((meal) => {
          const mealEntries = entries.filter(
            (entry) => entry.mealKey === meal.key,
          );
          if (mealEntries.length === 0) return null;
          return (
            <section key={meal.key} className="grid gap-2">
              <h2 className="m-0 text-xs font-bold tracking-[0.18em] text-guide-muted uppercase">
                {meal.label}
              </h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {mealEntries.map((entry) => {
                  const food = foodsById.get(entry.foodId);
                  const name = food?.name ?? entry.foodId;
                  const portion =
                    food?.unit != null
                      ? formatUnits(entry.grams / food.unit.gramsPerUnit, food.unit)
                      : formatGrams(entry.grams);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-2xl border border-guide-line bg-guide-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate font-bold">{name}</p>
                        <p className="m-0 text-sm text-guide-muted tabular-nums">
                          {portion} ·{" "}
                          {formatKcal(
                            Math.round(entryCalories(entry, foodsById)),
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remover ${name}`}
                        onClick={() => removeEntry(entry.id)}
                        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-guide-line text-guide-muted transition-colors duration-150 hover:border-guide-accent/60 hover:text-guide-accent"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4"
                          aria-hidden="true"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                        >
                          <path d="M5 7h14M10 7V5h4v2m-6 0 1 12h6l1-12" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
