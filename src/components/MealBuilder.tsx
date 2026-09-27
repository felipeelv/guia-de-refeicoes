import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { calculatePortions } from "../domain/calculate-portions.ts";
import type {
  Food,
  MealConfig,
  Person,
  PortionCalculationResult,
} from "../domain/types.ts";
import { CALCULATION_ERROR_MESSAGE, formatPortion } from "../format.ts";
import { FoodSelector } from "./FoodSelector.tsx";
import { useOptionalLog } from "./LogContext.tsx";
import { MEAL_VISUALS } from "./MealVisuals.tsx";
import { PortionResult } from "./PortionResult.tsx";

export const NO_SECOND_CARBOHYDRATE_LABEL = "Sem segundo carboidrato";
export const ADD_SECOND_CARBOHYDRATE_LABEL = "Adicionar segundo carboidrato";

function resultSignature(result: PortionCalculationResult): string {
  const items = result.secondCarbohydrate
    ? [result.carbohydrate, result.secondCarbohydrate, result.protein]
    : [result.carbohydrate, result.protein];
  return `${result.mealKey}:${items.map((item) => `${item.foodId}:${item.grams}`).join("|")}`;
}

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
                  ? "bg-guide-accent text-guide-ink"
                  : state === "current"
                    ? "border-2 border-guide-accent bg-guide-card text-guide-accent-ink"
                    : "border-2 border-guide-muted/30 bg-guide-card text-guide-muted"
              }`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span
              className={`truncate text-xs ${
                state === "pending" ? "text-guide-muted" : "font-medium text-guide-ink"
              }`}
            >
              {label}
            </span>
            {index < labels.length - 1 ? (
              <span
                className={`h-0.5 min-w-2 flex-1 rounded-full ${
                  state === "done" ? "bg-guide-accent" : "bg-guide-muted/25"
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
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 px-5"
      aria-hidden="true"
    >
      <div className="mx-auto max-w-md rounded-card bg-guide-ink/95 px-4 py-3 text-white shadow-pop backdrop-blur-md">
        <div className="flex items-end justify-between gap-2">
          {items.map((item, index) => (
            <div key={item.foodId} className="flex min-w-0 items-end gap-2">
              {index > 0 ? (
                <span className="pb-1 font-display text-lg text-guide-accent">
                  +
                </span>
              ) : null}
              <p className="m-0 min-w-0">
                <span className="block truncate text-xs text-white/70">
                  {item.name}
                </span>
                <span className="block truncate font-display text-xl tabular-nums">
                  {formatPortion(item)}
                </span>
              </p>
            </div>
          ))}
        </div>
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
  const log = useOptionalLog();
  const [loggedSignature, setLoggedSignature] = useState<string | null>(null);
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
      className={`mx-auto grid w-full max-w-md gap-6 px-5 pt-2 ${
        outcome.kind === "result"
          ? "pb-[calc(12rem+env(safe-area-inset-bottom))]"
          : "pb-[calc(7rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <header className="grid gap-4">
        <div className="overflow-hidden rounded-card bg-guide-card shadow-card">
          <div className="relative h-36 bg-guide-line">
            <img
              src={visual.image}
              alt=""
              width={460}
              height={460}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute top-3 left-3 flex size-9 items-center justify-center rounded-full bg-white/85 text-guide-accent-ink backdrop-blur-sm [&_svg]:size-5">
              {visual.icon}
            </span>
          </div>
          <div className="grid gap-0.5 px-4 py-3">
            <h1 className="font-display m-0 text-[22px] leading-tight text-pretty">
              {meal.label}
            </h1>
            <p className="m-0 text-sm text-guide-muted">
              Cardápio de {person.name}
            </p>
          </div>
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
                className="min-h-8 cursor-pointer rounded-card border-0 bg-transparent px-2 text-sm font-medium text-guide-accent-ink hover:underline"
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
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed border-guide-accent/40 bg-transparent px-4 font-medium text-guide-accent-ink transition-[border-color,background-color] duration-150 hover:border-guide-accent hover:bg-guide-card"
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
            className="m-0 rounded-card bg-guide-danger-bg p-4 text-guide-danger"
            role="alert"
          >
            {CALCULATION_ERROR_MESSAGE}
          </p>
        ) : null}
        {outcome.kind === "incomplete" && instruction ? (
          <p className="m-0 rounded-card border-2 border-dashed border-guide-muted/25 p-4 text-center text-sm text-guide-muted">
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
        {outcome.kind === "result" && log ? (
          <button
            type="button"
            disabled={loggedSignature === resultSignature(outcome.result)}
            onClick={() => {
              const result = outcome.result;
              const items = result.secondCarbohydrate
                ? [result.carbohydrate, result.secondCarbohydrate, result.protein]
                : [result.carbohydrate, result.protein];
              for (const item of items) {
                log.addEntry({
                  foodId: item.foodId,
                  grams: item.grams,
                  mealKey: result.mealKey,
                });
              }
              setLoggedSignature(resultSignature(result));
            }}
            className="mt-4 inline-flex min-h-[50px] w-full cursor-pointer items-center justify-center rounded-card border-0 bg-guide-primary px-4 font-bold text-white transition-[background-color,color,transform] duration-150 hover:bg-guide-primary-hover active:scale-[0.99] disabled:cursor-default disabled:bg-guide-success-bg disabled:text-guide-success"
          >
            {loggedSignature === resultSignature(outcome.result)
              ? "Registrado no diário"
              : "Registrar esta refeição"}
          </button>
        ) : null}
      </div>
      <p className="m-0 text-sm text-guide-muted text-pretty">
        Estimativa de consulta. Composição, corte e preparo podem alterar os
        valores. Não é orientação individual.
      </p>
      <Link
        to={`/${person.key}`}
        className="inline-flex min-h-[50px] items-center justify-center rounded-card bg-guide-card px-4 text-center font-medium text-guide-ink no-underline shadow-card transition-[background-color,transform] duration-150 hover:bg-guide-line active:scale-[0.99]"
      >
        Escolher outra refeição
      </Link>
      {outcome.kind === "result" ? <StickySummary result={outcome.result} /> : null}
    </main>
  );
}
