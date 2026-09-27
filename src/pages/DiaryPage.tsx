import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import { LogEntryForm } from "../components/LogEntryForm.tsx";
import { useLog } from "../components/LogContext.tsx";
import { entryCalories } from "../domain/day-log.ts";
import { macroTargetMessage } from "../domain/nutrition/summarize-nutrition.ts";
import {
  PARTIAL_TOTAL_LABEL,
  REDISTRIBUTION_HELP,
} from "../diet/copy.ts";
import { useDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import {
  formatBalance,
  formatMagnitude,
  frozenNutrientTotal,
} from "../diet/nutrient-display.ts";
import type { FrozenNutrients, LogEntryV2, MealKey, Person } from "../domain/types.ts";
import { formatGrams, formatKcal, formatUnits } from "../format.ts";

function formatSaoPauloDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day, 15)).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function DiaryPage() {
  if (!dietFlags.diaryV2) return <DiaryLegacy />;
  return <DiaryV2 />;
}

function NutrientLine({
  label,
  entries,
  nutrient,
  unit,
}: {
  label: string;
  entries: readonly { nutrients: FrozenNutrients }[];
  nutrient: keyof FrozenNutrients;
  unit: "kcal" | "g";
}) {
  const total = frozenNutrientTotal(entries, nutrient);
  if (total.known == null) {
    return (
      <p className="m-0 text-sm text-guide-muted">
        {label}: {PARTIAL_TOTAL_LABEL}
      </p>
    );
  }
  const shown =
    unit === "kcal"
      ? formatMagnitude(total.known, "kcal")
      : formatMagnitude(total.known, "g");
  return (
    <p className="m-0 text-sm">
      {label}: {shown}
      {total.partial ? ` (${PARTIAL_TOTAL_LABEL})` : ""}
    </p>
  );
}

function DiaryV2() {
  const person = useOutletContext<Person>();
  const diet = useDiet();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gramsText, setGramsText] = useState("");
  const macroMessage = macroTargetMessage(diet.summary);
  const dayCalories = frozenNutrientTotal(diet.entries, "calories");
  const dayKcal =
    dayCalories.known == null ? null : formatMagnitude(dayCalories.known, "kcal");
  const targetKcal = formatMagnitude(diet.baseDaily.calories, "kcal");
  const balance = diet.summary.balances.calories;

  return (
    <main className="mx-auto grid w-full max-w-md content-start gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="grid gap-1">
        <p className="m-0 text-sm font-medium text-guide-accent-ink">Registro do dia</p>
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">
          Diário de {person.name}
        </h1>
        <p className="m-0 text-sm text-guide-muted first-letter:uppercase" data-date={diet.today}>
          {formatSaoPauloDay(diet.today)}
        </p>
      </header>

      <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm text-guide-muted">Consumido hoje</p>
            <p className="m-0 mt-1 font-display text-[28px] leading-none tabular-nums">
              {dayKcal ?? PARTIAL_TOTAL_LABEL}
              {dayCalories.partial && dayKcal ? ` (${PARTIAL_TOTAL_LABEL})` : ""}
            </p>
          </div>
          <p className="m-0 text-sm text-guide-muted tabular-nums">Meta {targetKcal}</p>
        </div>
        <p className="m-0 text-sm tabular-nums">
          Saldo: {formatBalance(balance, "kcal")}
          {dayCalories.partial ? ` (${PARTIAL_TOTAL_LABEL})` : ""}
        </p>
        {macroMessage ? (
          <p className="m-0 text-sm text-guide-muted">{macroMessage}</p>
        ) : (
          <div className="grid gap-1">
            {(
              [
                ["Proteínas", "proteinGrams"],
                ["Carboidratos", "carbohydrateGrams"],
                ["Gorduras", "fatGrams"],
              ] as const
            ).map(([label, key]) => (
              <p key={key} className="m-0 text-sm">
                {label}: consumido{" "}
                {formatMacroConsumed(diet.entries, key)}, meta{" "}
                {formatMagnitude(diet.baseDaily[key], "g")}, saldo{" "}
                {formatBalance(diet.summary.balances[key] ?? Number.NaN, "g")}
              </p>
            ))}
          </div>
        )}
        <ul className="m-0 grid list-none gap-2 p-0">
          {mealsInOrder(person.meals).map((meal) => {
            const mealEntries = diet.entries.filter((entry) => entry.mealKey === meal.key);
            const target = diet.mealTargets.find((item) => item.mealKey === meal.key);
            const consumed = frozenNutrientTotal(mealEntries, "calories");
            const mealBalance =
              target && consumed.known != null && !consumed.partial
                ? target.calories - consumed.known
                : Number.NaN;
            return (
              <li key={meal.key} className="grid gap-0.5 text-sm">
                <span className="font-medium text-guide-body">{meal.label}</span>
                <span className="tabular-nums">
                  Consumido{" "}
                  {consumed.known == null
                    ? PARTIAL_TOTAL_LABEL
                    : formatMagnitude(consumed.known, "kcal")}
                  {consumed.partial && consumed.known != null ? ` (${PARTIAL_TOTAL_LABEL})` : ""}
                  {target ? ` · meta ${formatMagnitude(target.calories, "kcal")}` : ""}
                  {Number.isFinite(mealBalance)
                    ? ` · saldo ${formatBalance(mealBalance, "kcal")}`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-sm text-guide-muted">{REDISTRIBUTION_HELP}</p>
      </section>

      <LogEntryForm person={person} />

      {diet.entries.length === 0 ? (
        <p className="m-0 rounded-card border-2 border-dashed border-guide-muted/25 p-4 text-center text-sm text-guide-muted">
          Nada registrado ainda.
        </p>
      ) : (
        mealsInOrder(person.meals).map((meal) => {
          const mealEntries = diet.entries.filter((entry) => entry.mealKey === meal.key);
          if (mealEntries.length === 0) return null;
          return (
            <section key={meal.key} className="grid gap-2">
              <h2 className="m-0 text-lg font-medium text-guide-ink">{meal.label}</h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {mealEntries.map((entry) => (
                  <DiaryEntry
                    key={entry.id}
                    entry={entry}
                    editing={editingId === entry.id}
                    gramsText={gramsText}
                    onEdit={() => {
                      setEditingId(entry.id);
                      setGramsText(String(entry.grams));
                    }}
                    onGrams={setGramsText}
                    onSave={() => {
                      const grams = Number(gramsText);
                      const saved = diet.updateEntryGrams(entry.id, grams);
                      if (saved) setEditingId(null);
                    }}
                    onRemove={() => diet.removeEntry(entry.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}

function formatMacroConsumed(
  entries: readonly { nutrients: FrozenNutrients }[],
  key: "proteinGrams" | "carbohydrateGrams" | "fatGrams",
): string {
  const total = frozenNutrientTotal(entries, key);
  if (total.known == null) return PARTIAL_TOTAL_LABEL;
  const shown = formatMagnitude(total.known, "g");
  return total.partial ? `${shown} (${PARTIAL_TOTAL_LABEL})` : shown;
}

function DiaryEntry({
  entry,
  editing,
  gramsText,
  onEdit,
  onGrams,
  onSave,
  onRemove,
}: {
  entry: LogEntryV2;
  editing: boolean;
  gramsText: string;
  onEdit: () => void;
  onGrams: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const portion =
    entry.units != null && entry.grams > 0
      ? formatGrams(entry.grams)
      : formatGrams(entry.grams);
  const calories =
    entry.nutrients.calories == null ? null : formatMagnitude(entry.nutrients.calories, "kcal");
  return (
    <li className="grid gap-2 rounded-card bg-guide-card px-4 py-3 shadow-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-medium">{entry.foodName}</p>
          <p className="m-0 text-sm text-guide-muted tabular-nums">
            {portion}
            {calories ? ` · ${calories}` : ` · ${PARTIAL_TOTAL_LABEL}`}
          </p>
          <NutrientLine label="Proteínas" entries={[entry]} nutrient="proteinGrams" unit="g" />
          <NutrientLine label="Carboidratos" entries={[entry]} nutrient="carbohydrateGrams" unit="g" />
          <NutrientLine label="Gorduras" entries={[entry]} nutrient="fatGrams" unit="g" />
        </div>
        <button
          type="button"
          aria-label={`Remover ${entry.foodName}`}
          onClick={onRemove}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-guide-line text-guide-body transition-colors duration-150 hover:bg-guide-danger-bg hover:text-guide-danger"
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
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <label className="grid flex-1 gap-1 text-sm text-guide-body">
            Gramas de {entry.foodName}
            <input
              inputMode="decimal"
              value={gramsText}
              onChange={(event) => onGrams(event.target.value)}
              className="min-h-10 rounded-card border-0 bg-guide-paper px-3"
            />
          </label>
          <button
            type="button"
            onClick={onSave}
            className="mt-5 min-h-10 cursor-pointer rounded-card border-0 bg-guide-primary px-3 font-medium text-white"
          >
            Atualizar quantidade
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="min-h-8 cursor-pointer justify-self-start rounded-card border-0 bg-transparent px-0 text-sm font-medium text-guide-accent-ink underline"
        >
          Editar {entry.foodName}
        </button>
      )}
    </li>
  );
}

function DiaryLegacy() {
  const person = useOutletContext<Person>();
  const { foods } = useCatalog();
  const { entries, totalKcal } = useLog();
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
    <main className="mx-auto grid w-full max-w-md content-start gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="grid gap-1">
        <p className="m-0 text-sm font-medium text-guide-accent-ink">Registro do dia</p>
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">
          Diário de {person.name}
        </h1>
        <p className="m-0 text-sm text-guide-muted first-letter:uppercase">{today}</p>
      </header>
      <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm text-guide-muted">Consumido hoje</p>
            <p className="m-0 mt-1 font-display text-[28px] leading-none tabular-nums">
              {formatKcal(totalKcal)}
            </p>
          </div>
          <p className="m-0 text-sm text-guide-muted tabular-nums">
            de {formatKcal(person.dailyCalories)}
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-guide-line">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              over ? "bg-guide-danger" : "bg-guide-accent"
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
              <li key={meal.key} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-guide-body">{meal.label}</span>
                <span className="tabular-nums">
                  {formatKcal(consumed)}
                  <span className="text-guide-muted"> / {formatKcal(meal.targetCalories)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <LogEntryForm person={person} />
      {entries.length === 0 ? (
        <p className="m-0 rounded-card border-2 border-dashed border-guide-muted/25 p-4 text-center text-sm text-guide-muted">
          Nada registrado ainda.
        </p>
      ) : (
        mealsInOrder(person.meals).map((meal) => (
          <LegacyMealEntries
            key={meal.key}
            mealKey={meal.key}
            label={meal.label}
            foodsById={foodsById}
          />
        ))
      )}
    </main>
  );
}

function LegacyMealEntries({
  mealKey,
  label,
  foodsById,
}: {
  mealKey: MealKey;
  label: string;
  foodsById: Map<string, { name: string; unit?: { gramsPerUnit: number; singular: string; plural: string; stepUnits: number } | null; caloriesPer100g: number }>;
}) {
  const { entries, removeEntry } = useLog();
  const { foods } = useCatalog();
  const catalog = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);
  const mealEntries = entries.filter((entry) => entry.mealKey === mealKey);
  if (mealEntries.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h2 className="m-0 text-lg font-medium text-guide-ink">{label}</h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {mealEntries.map((entry) => {
          const food = catalog.get(entry.foodId);
          const name = food?.name ?? entry.foodId;
          const portion =
            food?.unit != null
              ? formatUnits(entry.grams / food.unit.gramsPerUnit, food.unit)
              : formatGrams(entry.grams);
          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-card bg-guide-card px-4 py-3 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate font-medium">{name}</p>
                <p className="m-0 text-sm text-guide-muted tabular-nums">
                  {portion} · {formatKcal(Math.round(entryCalories(entry, foodsById as never)))}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remover ${name}`}
                onClick={() => removeEntry(entry.id)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-guide-line text-guide-body"
              >
                Remover
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
