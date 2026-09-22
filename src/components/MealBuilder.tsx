import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { calculatePortions } from "../domain/calculate-portions.ts";
import type {
  Food,
  MealConfig,
  Person,
  PortionCalculationResult,
} from "../domain/types.ts";
import { CALCULATION_ERROR_MESSAGE, formatGrams, formatKcal } from "../format.ts";
import { FoodSelector } from "./FoodSelector.tsx";
import { MEAL_VISUALS } from "./MealVisuals.tsx";
import { PortionResult } from "./PortionResult.tsx";

export const NO_SECOND_CARBOHYDRATE_LABEL = "Sem segundo carboidrato";
export const ADD_SECOND_CARBOHYDRATE_LABEL = "Adicionar segundo carboidrato";

type StepState = "done" | "current" | "pending";

function Steps({ states }: { states: [StepState, StepState, StepState] }) {
  const labels = ["Carboidrato", "Proteína", "Porção"];
  return (
    <ol className="m-0 flex list-none items-center gap-1 p-0" aria-label="Etapas">
      {labels.map((label, index) => {
        const state = states[index];
        return (
          <li
            key={label}
            className="flex min-w-0 flex-1 items-center gap-1"
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                state === "done"
                  ? "bg-guide-accent text-white"
                  : state === "current"
                    ? "border-2 border-guide-accent bg-guide-card text-guide-accent"
                    : "border-2 border-guide-line bg-guide-card text-guide-muted"
              }`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span
              className={`truncate text-xs ${
                state === "pending" ? "text-guide-muted" : "font-bold text-guide-ink"
              }`}
            >
              {label}
            </span>
            {index < labels.length - 1 ? (
              <span
                className={`h-0.5 min-w-2 flex-1 rounded-full ${
                  state === "done" ? "bg-guide-accent" : "bg-guide-line"
                }`}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StickySummary({ result }: { result: PortionCalculationResult }) {
  const items = result.secondCarbohydrate
    ? [result.carbohydrate, result.secondCarbohydrate, result.protein]
    : [result.carbohydrate, result.protein];
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-hidden="true"
    >
      <div className="mx-auto max-w-md rounded-3xl border border-guide-line bg-guide-card/95 px-4 py-3 shadow-[0_-10px_36px_rgb(31_26_23/0.14)] backdrop-blur-sm">
        <div className="flex items-end justify-between gap-2">
          {items.map((item, index) => (
            <div key={item.foodId} className="flex min-w-0 items-end gap-2">
              {index > 0 ? (
                <span className="pb-1 font-display text-lg text-guide-accent">
                  +
                </span>
              ) : null}
              <p className="m-0 min-w-0">
                <span className="block truncate text-xs text-guide-muted">
                  {item.name}
                </span>
                <span className="font-display text-xl tabular-nums">
                  {formatGrams(item.grams)}
                </span>
              </p>
            </div>
          ))}
        </div>
        <p className="m-0 pt-1 text-center text-sm font-bold tabular-nums text-guide-accent">
          {formatKcal(result.totalCalories)}
        </p>
      </div>
    </div>
  );
}

export function MealBuilderScreen({
  person,
  meal,
  carbohydrates,
  proteins,
  carbohydrateId,
  secondCarbohydrateId,
  proteinId,
  onCarbohydrateChange,
  onSecondCarbohydrateChange,
  onProteinChange,
}: {
  person: Person;
  meal: MealConfig;
  carbohydrates: Food[];
  proteins: Food[];
  carbohydrateId: string | null;
  secondCarbohydrateId: string | null;
  proteinId: string | null;
  onCarbohydrateChange: (id: string) => void;
  onSecondCarbohydrateChange: (id: string | null) => void;
  onProteinChange: (id: string) => void;
}) {
  const visual = MEAL_VISUALS[meal.key];
  const carbohydrate =
    carbohydrates.find((food) => food.id === carbohydrateId) ?? null;
  const protein = proteins.find((food) => food.id === proteinId) ?? null;
  const secondOptions = carbohydrates.filter(
    (food) => food.id !== carbohydrate?.id,
  );
  const secondCarbohydrate =
    secondOptions.find((food) => food.id === secondCarbohydrateId) ?? null;
  const [secondRequested, setSecondRequested] = useState(false);
  const secondOpen = secondRequested || secondCarbohydrate !== null;
  const outcome = useMemo(() => {
    if (!carbohydrate || !protein) return { kind: "incomplete" as const };
    try {
      const result = calculatePortions({
        meal,
        carbohydrateFood: carbohydrate,
        secondCarbohydrateFood: secondCarbohydrate,
        proteinFood: protein,
        roundingIncrementGrams: person.roundingIncrementGrams,
      });
      if (
        !Number.isFinite(result.totalCalories) ||
        result.carbohydrate.grams <= 0 ||
        result.protein.grams <= 0 ||
        (result.secondCarbohydrate !== null &&
          result.secondCarbohydrate.grams <= 0)
      ) {
        return { kind: "error" as const };
      }
      return { kind: "result" as const, result };
    } catch {
      return { kind: "error" as const };
    }
  }, [carbohydrate, secondCarbohydrate, protein, meal, person]);

  const instruction =
    !carbohydrate && !protein
      ? "Escolha um carboidrato e uma proteína."
      : !protein
        ? "Agora escolha a proteína."
        : !carbohydrate
          ? "Agora escolha o carboidrato."
          : null;
  const steps: [StepState, StepState, StepState] = [
    carbohydrate ? "done" : "current",
    protein ? "done" : carbohydrate ? "current" : "pending",
    carbohydrate && protein ? "current" : "pending",
  ];

  function closeSecond() {
    setSecondRequested(false);
    onSecondCarbohydrateChange(null);
  }

  return (
    <main
      className={`mx-auto grid w-full max-w-md gap-6 px-4 py-5 ${
        outcome.kind === "result" ? "pb-40" : "pb-[max(2rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <header className="grid gap-4">
        <div
          className={`relative flex items-center gap-4 overflow-hidden rounded-3xl ${visual.surface} p-4`}
        >
          <span className={`relative shrink-0 ${visual.ink}`}>{visual.icon}</span>
          <div className="relative min-w-0 flex-1">
            <h1 className="font-display m-0 text-2xl leading-tight text-pretty">
              {meal.label}
            </h1>
            <p className="m-0 text-sm text-guide-muted">
              Meta de {person.name}
            </p>
          </div>
          <p className="relative m-0 shrink-0 font-display text-2xl tabular-nums">
            {formatKcal(meal.targetCalories)}
          </p>
        </div>
        <Steps states={steps} />
      </header>
      <FoodSelector
        legend="Carboidrato"
        name="carbohydrate"
        foods={carbohydrates}
        selectedId={carbohydrate?.id ?? null}
        onChange={(id) => id && onCarbohydrateChange(id)}
      />
      {secondOptions.length > 0 ? (
        secondOpen ? (
          <FoodSelector
            legend="Segundo carboidrato (opcional)"
            name="second-carbohydrate"
            foods={secondOptions}
            selectedId={secondCarbohydrate?.id ?? null}
            onChange={onSecondCarbohydrateChange}
            noneLabel={NO_SECOND_CARBOHYDRATE_LABEL}
            action={
              <button
                type="button"
                onClick={closeSecond}
                className="min-h-8 cursor-pointer rounded-full border-0 bg-transparent px-2 text-xs font-bold text-guide-accent hover:underline"
              >
                Remover
              </button>
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setSecondRequested(true)}
            aria-expanded="false"
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-guide-line bg-transparent px-4 font-bold text-guide-accent transition-[border-color,background-color] duration-150 hover:border-guide-accent/60 hover:bg-guide-card"
          >
            <span aria-hidden="true" className="font-display text-xl leading-none">
              +
            </span>
            {ADD_SECOND_CARBOHYDRATE_LABEL}
          </button>
        )
      ) : null}
      <FoodSelector
        legend="Proteína"
        name="protein"
        foods={proteins}
        selectedId={protein?.id ?? null}
        onChange={(id) => id && onProteinChange(id)}
      />
      <div aria-live="polite">
        {outcome.kind === "error" ? (
          <p
            className="m-0 rounded-3xl border border-guide-line bg-guide-card p-4"
            role="alert"
          >
            {CALCULATION_ERROR_MESSAGE}
          </p>
        ) : null}
        {outcome.kind === "incomplete" && instruction ? (
          <p className="m-0 rounded-3xl border border-dashed border-guide-line bg-guide-card/60 p-4 text-guide-muted">
            {instruction}
          </p>
        ) : null}
        {outcome.kind === "result" && carbohydrate && protein ? (
          <PortionResult
            result={outcome.result}
            carbohydrate={carbohydrate}
            secondCarbohydrate={secondCarbohydrate}
            protein={protein}
          />
        ) : null}
      </div>
      <p className="m-0 text-sm text-guide-muted text-pretty">
        Estimativa de consulta. Composição, corte e preparo podem alterar os
        valores. Não é orientação individual.
      </p>
      <Link
        to={`/${person.key}`}
        className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-guide-accent px-4 text-center font-bold text-white no-underline transition-[background-color,transform] duration-150 hover:bg-guide-focus active:scale-[0.99]"
      >
        Escolher outra refeição
      </Link>
      {outcome.kind === "result" ? <StickySummary result={outcome.result} /> : null}
    </main>
  );
}
