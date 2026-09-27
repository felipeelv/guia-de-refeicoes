import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { macroOptimizationIssue } from "../catalog/catalog.ts";
import { calculatePortions } from "../domain/calculate-portions.ts";
import { solveMealPortions } from "../domain/nutrition/solve-portions.ts";
import type {
  Food,
  MealConfig,
  MealSelection,
  Person,
  PortionCalculationResult,
  PortionResultItem,
  PortionSolution,
} from "../domain/types.ts";
import {
  MANUAL_LOG_STILL_AVAILABLE,
  solutionStateLabel,
} from "../diet/copy.ts";
import { useOptionalDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import { allowsSecondProtein, toggleSlot } from "../diet/meal-selection.ts";
import { formatMagnitude, freezeFromFood } from "../diet/nutrient-display.ts";
import { buildSolveMealInput } from "../diet/solver-input.ts";
import { CALCULATION_ERROR_MESSAGE, formatPortion } from "../format.ts";
import { FoodSelector } from "./FoodSelector.tsx";
import { useOptionalLog } from "./LogContext.tsx";
import { MEAL_VISUALS } from "./MealVisuals.tsx";
import { PortionResult } from "./PortionResult.tsx";

function portionSignature(mealKey: string, items: readonly PortionResultItem[]): string {
  return `${mealKey}:${items.map((item) => `${item.foodId}:${item.grams}`).join("|")}`;
}

function listedPortions(result: PortionCalculationResult): PortionResultItem[] {
  return [
    result.carbohydrate,
    result.secondCarbohydrate,
    result.protein,
    result.secondProtein,
  ].filter((item): item is PortionResultItem => item !== null && item.grams > 0);
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
  const items = listedPortions(result);
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
  secondProteinId = null,
  onCarbohydrateSelectionChange,
  onProteinSelectionChange,
}: {
  person: Person;
  meal: MealConfig;
  carbohydrates: Food[];
  proteins: Food[];
  carbohydrateId: string | null;
  secondCarbohydrateId: string | null;
  proteinId: string | null;
  secondProteinId?: string | null;
  onCarbohydrateSelectionChange: (primary: string | null, second: string | null) => void;
  onProteinSelectionChange: (primary: string | null, second: string | null) => void;
}) {
  const visual = MEAL_VISUALS[meal.key];
  const carbohydrate =
    carbohydrates.find((food) => food.id === carbohydrateId) ?? null;
  const protein = proteins.find((food) => food.id === proteinId) ?? null;
  const secondCarbohydrate =
    secondCarbohydrateId && secondCarbohydrateId !== carbohydrate?.id
      ? (carbohydrates.find((food) => food.id === secondCarbohydrateId) ?? null)
      : null;
  const proteinCap = allowsSecondProtein(meal.key) ? 2 : 1;
  const secondProtein =
    proteinCap > 1 && secondProteinId && secondProteinId !== protein?.id
      ? (proteins.find((food) => food.id === secondProteinId) ?? null)
      : null;
  const carbohydrateIds = [carbohydrate?.id, secondCarbohydrate?.id].filter(
    (id): id is string => Boolean(id),
  );
  const proteinIds = [protein?.id, secondProtein?.id].filter(
    (id): id is string => Boolean(id),
  );
  const log = useOptionalLog();
  const diet = useOptionalDiet();
  const registeredSignature = useRef<string | null>(null);
  const [loggedSignature, setLoggedSignature] = useState<string | null>(null);
  const personalized =
    dietFlags.macroSolver && diet?.effective?.origin === "confirmed";
  const blocked = Boolean(dietFlags.diaryV2 && diet?.energyNotice);
  const outcome = useMemo(() => {
    if (blocked) return { kind: "blocked" as const };
    if (!carbohydrate || !protein) return { kind: "incomplete" as const };
    const calorieInput = {
      meal,
      carbohydrateFood: carbohydrate,
      secondCarbohydrateFood: secondCarbohydrate,
      proteinFood: protein,
      secondProteinFood: secondProtein,
      roundingIncrementGrams: person.roundingIncrementGrams,
    };
    function calorieResult(): PortionCalculationResult | null {
      try {
        const result = calculatePortions(calorieInput);
        if (
          !Number.isFinite(result.totalCalories) ||
          result.carbohydrate.grams <= 0 ||
          result.protein.grams <= 0 ||
          (result.secondCarbohydrate !== null && result.secondCarbohydrate.grams <= 0) ||
          (result.secondProtein !== null && result.secondProtein.grams <= 0)
        ) {
          return null;
        }
        return result;
      } catch {
        return null;
      }
    }
    if (personalized && diet) {
      const mealTarget = diet.mealTargets.find((item) => item.mealKey === meal.key);
      if (!mealTarget) return { kind: "error" as const };
      const selected = [carbohydrate, secondCarbohydrate, protein, secondProtein].filter(
        (food): food is Food => food !== null,
      );
      const selection: MealSelection = {
        mealKey: meal.key,
        carbohydrateId: carbohydrate.id,
        carbohydrate2Id: secondCarbohydrate?.id ?? null,
        proteinId: protein.id,
        protein2Id: secondProtein?.id ?? null,
      };
      const built = buildSolveMealInput({
        selection,
        foods: selected,
        targets: {
          calories: mealTarget.calories,
          proteinGrams: mealTarget.proteinGrams,
          carbohydrateGrams: mealTarget.carbohydrateGrams,
          fatGrams: mealTarget.fatGrams,
        },
        roundingIncrementGrams: person.roundingIncrementGrams,
      });
      const reasons = [
        ...selected
          .map((food) => macroOptimizationIssue(food, person.roundingIncrementGrams))
          .filter((reason): reason is string => reason !== null),
        ...built.reasons,
      ];
      let solution: PortionSolution;
      try {
        solution = solveMealPortions(built.request);
      } catch {
        return { kind: "error" as const };
      }
      const usableCalorie =
        solution.state === "missing_nutrition" || reasons.length > 0
          ? calorieResult()
          : null;
      return {
        kind: "macro" as const,
        solution,
        reasons: [...new Set(reasons)],
        calorie: usableCalorie,
      };
    }
    const result = calorieResult();
    if (!result) return { kind: "error" as const };
    return { kind: "result" as const, result };
  }, [
    blocked,
    carbohydrate,
    secondCarbohydrate,
    protein,
    secondProtein,
    meal,
    person,
    personalized,
    diet,
  ]);

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

  function toggleCarbohydrate(id: string) {
    const next = toggleSlot(carbohydrate?.id ?? null, secondCarbohydrate?.id ?? null, id, 2);
    onCarbohydrateSelectionChange(next.primary, next.second);
  }

  function toggleProtein(id: string) {
    const next = toggleSlot(protein?.id ?? null, secondProtein?.id ?? null, id, proteinCap);
    onProteinSelectionChange(next.primary, next.second);
  }

  const displayed: PortionCalculationResult | null =
    outcome.kind === "result"
      ? outcome.result
      : outcome.kind === "macro" && outcome.calorie && outcome.solution.portions.length === 0
        ? outcome.calorie
        : outcome.kind === "macro"
          ? solutionAsCalculation(outcome.solution, carbohydrate, secondCarbohydrate, protein, secondProtein)
          : null;
  const displayedItems = displayed ? listedPortions(displayed) : [];
  const signature = displayed ? portionSignature(displayed.mealKey, displayedItems) : null;
  const macroStatus =
    outcome.kind === "macro" ? solutionStateLabel(outcome.solution.state) : null;
  const showMacroPortions =
    outcome.kind === "macro" &&
    outcome.solution.portions.some((item) => item.grams > 0) &&
    (outcome.solution.state === "within_targets" ||
      outcome.solution.state === "approximate" ||
      outcome.solution.state === "search_incomplete");

  return (
    <main
      className={`mx-auto grid w-full max-w-md gap-6 px-5 pt-2 ${
        displayedItems.length > 0
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
        selectedIds={carbohydrateIds}
        max={2}
        onToggle={toggleCarbohydrate}
      />
      <FoodSelector
        legend="Proteína"
        name="protein"
        foods={proteins}
        selectedIds={proteinIds}
        max={proteinCap}
        onToggle={toggleProtein}
      />
      <div aria-live="polite">
        {outcome.kind === "blocked" && diet?.energyNotice ? (
          <div className="grid gap-2 rounded-card bg-guide-card p-4 shadow-card" role="status">
            <p className="m-0 text-sm text-guide-body">{diet.energyNotice}</p>
            <p className="m-0 text-sm text-guide-muted">{MANUAL_LOG_STILL_AVAILABLE}</p>
          </div>
        ) : null}
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
        {outcome.kind === "macro" ? (
          <div className="grid gap-2">
            {showMacroPortions ? null : (
              <p className="m-0 text-sm font-medium text-guide-body">{macroStatus}</p>
            )}
            {outcome.reasons.map((reason) => (
              <p key={reason} className="m-0 text-sm text-guide-muted">
                {reason}
              </p>
            ))}
            {outcome.solution.state === "approximate" ||
            outcome.solution.state === "search_incomplete" ? (
              <DeviationList solution={outcome.solution} />
            ) : null}
          </div>
        ) : null}
        {displayed && carbohydrate && protein && (outcome.kind === "result" || showMacroPortions || outcome.kind === "macro") ? (
          <PortionResult
            result={displayed}
            carbohydrate={carbohydrate}
            secondCarbohydrate={secondCarbohydrate}
            protein={protein}
            secondProtein={secondProtein}
            statusLabel={showMacroPortions ? macroStatus : null}
          />
        ) : null}
        {displayed && displayedItems.length > 0 && signature && (log || diet) ? (
          <button
            type="button"
            disabled={loggedSignature === signature}
            onClick={() => {
              if (!displayed || registeredSignature.current === signature) return;
              registeredSignature.current = signature;
              const foodsById = new Map(
                [carbohydrate, secondCarbohydrate, protein, secondProtein]
                  .filter((food): food is Food => food !== null)
                  .map((food) => [food.id, food]),
              );
              if (dietFlags.diaryV2 && diet) {
                const saved = diet.addBatch(
                  displayedItems.map((item) => {
                    const food = foodsById.get(item.foodId);
                    if (!food) return null;
                    return {
                      food,
                      grams: item.grams,
                      units: item.units,
                      mealKey: displayed.mealKey,
                      nutrients: freezeFromFood(food, item.grams),
                    };
                  }).filter((item): item is NonNullable<typeof item> => item !== null),
                );
                if (!saved) {
                  registeredSignature.current = null;
                  return;
                }
              } else if (log) {
                for (const item of displayedItems) {
                  log.addEntry({
                    foodId: item.foodId,
                    grams: item.grams,
                    mealKey: displayed.mealKey,
                  });
                }
              } else {
                registeredSignature.current = null;
                return;
              }
              setLoggedSignature(signature);
            }}
            className="mt-4 inline-flex min-h-[50px] w-full cursor-pointer items-center justify-center rounded-card border-0 bg-guide-primary px-4 font-bold text-white transition-[background-color,color,transform] duration-150 hover:bg-guide-primary-hover active:scale-[0.99] disabled:cursor-default disabled:bg-guide-success-bg disabled:text-guide-success"
          >
            {loggedSignature === signature
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
      {displayed && displayedItems.length > 0 ? <StickySummary result={displayed} /> : null}
    </main>
  );
}

function solutionAsCalculation(
  solution: PortionSolution,
  carbohydrate: Food | null,
  secondCarbohydrate: Food | null,
  protein: Food | null,
  secondProtein: Food | null,
): PortionCalculationResult | null {
  const byRole = new Map(solution.portions.map((item) => [item.role, item]));
  const carb = byRole.get("carbohydrate");
  const proteinItem = byRole.get("protein");
  if (!carb || !proteinItem || !carbohydrate || !protein) return null;
  if (carb.grams <= 0 || proteinItem.grams <= 0) return null;
  const toItem = (food: Food, grams: number, units: number | null, calories: number): PortionResultItem => ({
    foodId: food.id,
    name: food.name,
    grams,
    units,
    unit: food.unit ?? null,
    calories,
  });
  const carb2 = byRole.get("carbohydrate2");
  const protein2 = byRole.get("protein2");
  const items = solution.portions.filter((item) => item.grams > 0);
  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  return {
    mealKey: solution.mealKey,
    targetCalories: solution.targets.calories,
    carbohydrate: toItem(carbohydrate, carb.grams, carb.units, carb.calories),
    secondCarbohydrate:
      carb2 && secondCarbohydrate && carb2.grams > 0
        ? toItem(secondCarbohydrate, carb2.grams, carb2.units, carb2.calories)
        : null,
    protein: toItem(protein, proteinItem.grams, proteinItem.units, proteinItem.calories),
    secondProtein:
      protein2 && secondProtein && protein2.grams > 0
        ? toItem(secondProtein, protein2.grams, protein2.units, protein2.calories)
        : null,
    totalCalories,
    differenceCalories: solution.deviations.calories,
    differencePercent: 0,
    toleranceStatus: solution.state === "within_targets" ? "within" : "above",
  };
}

function formatDeviation(value: number, unit: "kcal" | "g"): string {
  if (value > 0) return `excesso de ${formatMagnitude(value, unit)}`;
  if (value < 0) return `abaixo em ${formatMagnitude(value, unit)}`;
  return formatMagnitude(0, unit);
}

function DeviationList({ solution }: { solution: PortionSolution }) {
  const rows: [string, number, "kcal" | "g"][] = [
    ["Energia", solution.targets.calories, "kcal"],
    ["Proteínas", solution.targets.proteinGrams, "g"],
    ["Carboidratos", solution.targets.carbohydrateGrams, "g"],
    ["Gorduras", solution.targets.fatGrams, "g"],
  ];
  const totals: [string, number, "kcal" | "g"][] = [
    ["Energia", solution.totals.calories, "kcal"],
    ["Proteínas", solution.totals.proteinGrams, "g"],
    ["Carboidratos", solution.totals.carbohydrateGrams, "g"],
    ["Gorduras", solution.totals.fatGrams, "g"],
  ];
  const deltas: [string, number, "kcal" | "g"][] = [
    ["Energia", solution.deviations.calories, "kcal"],
    ["Proteínas", solution.deviations.proteinGrams, "g"],
    ["Carboidratos", solution.deviations.carbohydrateGrams, "g"],
    ["Gorduras", solution.deviations.fatGrams, "g"],
  ];
  return (
    <div className="grid gap-2 text-sm">
      <p className="m-0 font-medium">Metas da refeição</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {rows.map(([label, value, unit]) => (
          <li key={`meta-${label}`}>
            {label}: {formatMagnitude(value, unit)}
          </li>
        ))}
      </ul>
      <p className="m-0 font-medium">Totais desta combinação</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {totals.map(([label, value, unit]) => (
          <li key={`total-${label}`}>
            {label}: {formatMagnitude(value, unit)}
          </li>
        ))}
      </ul>
      <p className="m-0 font-medium">Desvios</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {deltas.map(([label, value, unit]) => (
          <li key={`delta-${label}`}>
            {label}: {formatDeviation(value, unit)}
          </li>
        ))}
      </ul>
    </div>
  );
}
