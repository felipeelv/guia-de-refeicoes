import { useMemo } from "react";
import { Link } from "react-router-dom";
import { calculatePortions } from "../domain/calculate-portions.ts";
import type { Food, MealConfig, PortionCalculationResult } from "../domain/types.ts";
import { CALCULATION_ERROR_MESSAGE, formatGrams, formatKcal } from "../format.ts";
import { FoodSelector } from "./FoodSelector.tsx";
import { MEAL_VISUALS } from "./MealVisuals.tsx";
import { PortionResult } from "./PortionResult.tsx";

export const NO_SECOND_CARBOHYDRATE_LABEL = "Sem segundo carboidrato";

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
                <span className="font-display text-xl font-medium tabular-nums">
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
  const outcome = useMemo(() => {
    if (!carbohydrate || !protein) return { kind: "incomplete" as const };
    try {
      const result = calculatePortions({
        meal,
        carbohydrateFood: carbohydrate,
        secondCarbohydrateFood: secondCarbohydrate,
        proteinFood: protein,
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
  }, [carbohydrate, secondCarbohydrate, protein, meal]);

  const instruction =
    !carbohydrate && !protein
      ? "Escolha um carboidrato e uma proteína."
      : !protein
        ? "Agora escolha a proteína."
        : !carbohydrate
          ? "Agora escolha o carboidrato."
          : null;

  return (
    <main
      className={`mx-auto grid w-full max-w-md gap-6 px-4 py-6 ${
        outcome.kind === "result" ? "pb-40" : "pb-[max(2rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <header
        className={`relative flex items-center gap-4 overflow-hidden rounded-3xl ${visual.surface} p-4`}
      >
        <span className={`relative shrink-0 ${visual.ink}`}>{visual.icon}</span>
        <div className="relative min-w-0 flex-1">
          <h1 className="font-display m-0 text-2xl leading-tight font-medium text-pretty">
            {meal.label}
          </h1>
          <p className="m-0 text-sm text-guide-muted">Meta da refeição</p>
        </div>
        <p className="relative m-0 shrink-0 font-display text-2xl font-medium tabular-nums">
          {formatKcal(meal.targetCalories)}
        </p>
      </header>
      <FoodSelector
        legend="Carboidrato"
        name="carbohydrate"
        foods={carbohydrates}
        selectedId={carbohydrate?.id ?? null}
        onChange={(id) => id && onCarbohydrateChange(id)}
      />
      {secondOptions.length > 0 ? (
        <FoodSelector
          legend="Segundo carboidrato (opcional)"
          name="second-carbohydrate"
          foods={secondOptions}
          selectedId={secondCarbohydrate?.id ?? null}
          onChange={onSecondCarbohydrateChange}
          noneLabel={NO_SECOND_CARBOHYDRATE_LABEL}
        />
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
        to="/"
        className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-guide-accent px-4 text-center font-bold text-white no-underline transition-[background-color,transform] duration-150 hover:bg-guide-focus active:scale-[0.99]"
      >
        Escolher outra refeição
      </Link>
      {outcome.kind === "result" ? <StickySummary result={outcome.result} /> : null}
    </main>
  );
}
