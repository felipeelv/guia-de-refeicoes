import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import { browserDraftStorage } from "../diet/browser-storage.ts";
import {
  ESTIMATE_NOT_COMPLETED,
  EXPERIMENTAL_DISCLAIMER,
} from "../diet/copy.ts";
import { useDiet } from "../diet/DietContext.tsx";
import {
  assessmentInputFromForm,
  clearDietDraft,
  initialDietForm,
  writeDietDraft,
  type DietFormState,
} from "../diet/draft-form.ts";
import { dietFlags } from "../diet/flags.ts";
import { CATALOG_VERSION } from "../diet/solver-input.ts";
import { formatKcal } from "../format.ts";
import { createDietProposal } from "../domain/nutrition/create-diet-plan.ts";
import { experimentalV1Policy } from "../domain/nutrition/policy.ts";
import {
  convertHeightToCentimeters,
  parseBrazilianDecimal,
  validateAssessment,
} from "../domain/nutrition/nutrition-validation.ts";
import type {
  ActivityLevel,
  DietGoal,
  DietPlan,
  FoodTag,
  MealKey,
  Person,
  SupportedRestriction,
} from "../domain/types.ts";
import { SUPPORTED_RESTRICTIONS } from "../domain/types.ts";

const STEPS = [
  "Dados para estimativa",
  "Objetivo e atividade",
  "Preferências e restrições",
  "Organização das refeições",
  "Revisão",
] as const;

const GOALS: { value: DietGoal; label: string }[] = [
  { value: "lose", label: "Perder peso" },
  { value: "maintain", label: "Manter peso" },
  { value: "gain", label: "Ganhar peso" },
];

const ACTIVITIES: { value: ActivityLevel; label: string; detail: string }[] = [
  { value: "low", label: "Baixa", detail: "Rotina predominantemente sentada e pouco movimento" },
  { value: "light", label: "Leve", detail: "Algum movimento e exercícios leves na semana" },
  { value: "moderate", label: "Moderada", detail: "Rotina com movimento e exercícios regulares" },
  { value: "high", label: "Alta", detail: "Rotina fisicamente exigente e/ou treino frequente" },
];

const RESTRICTION_LABEL: Record<SupportedRestriction, string> = {
  gluten: "Glúten",
  milk: "Leite",
  lactose: "Lactose",
  egg: "Ovo",
  fish: "Peixe",
  tree_nut: "Frutas de casca rija",
};

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function formatWhen(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString(
    "pt-BR",
    { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" },
  );
}

function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function entryInvalid(
  issues: readonly { field: string; code: string }[],
  field: string,
): boolean {
  return issues.some((item) => item.field === field && item.code !== "required");
}

function percentEntryInvalid(raw: string): boolean {
  if (raw.trim() === "") return false;
  const value = parseBrazilianDecimal(raw);
  return !Number.isFinite(value) || value <= 0;
}

const primaryButton =
  "inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-card border-0 bg-guide-primary px-4 font-bold text-white no-underline hover:bg-guide-primary-hover disabled:cursor-default disabled:opacity-40";
const quietButton =
  "inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-card border-0 bg-guide-card px-4 font-medium text-guide-ink no-underline shadow-card";
// O fundo da página é o mesmo paper do campo. border-0 faz o controle sumir.
// O diário mantém o poço sem borda de propósito, dentro do cartão branco.
const fieldClass =
  "box-border min-h-[50px] w-full rounded-card border-2 border-solid border-guide-muted bg-guide-paper px-4 py-3 font-sans text-base text-guide-ink ring-offset-2 ring-offset-guide-paper focus-visible:border-guide-focus focus-visible:ring-2 focus-visible:ring-guide-focus aria-invalid:border-[3px] aria-invalid:border-guide-danger aria-invalid:ring-2 aria-invalid:ring-guide-danger";

export function CalculateDietPage() {
  const adjusted = useOutletContext<Person>();
  const { persons, foods } = useCatalog();
  const person = persons.find((item) => item.key === adjusted.key) ?? adjusted;
  const diet = useDiet();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DietFormState>(() =>
    initialDietForm(
      browserDraftStorage(),
      person,
      diet.profile.confirmedAssessment,
    ),
  );
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    setStep(0);
    setApplied(null);
    setForm(
      initialDietForm(
        browserDraftStorage(),
        person,
        diet.profile.confirmedAssessment,
      ),
    );
    // Só troca de pessoa. Aplicar o plano não pode apagar a confirmação na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.key]);

  function update(patch: Partial<DietFormState>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      try {
        writeDietDraft(browserDraftStorage(), person.key, next);
      } catch {
        // O rascunho fica na memória. O aviso de gravação do plano é outro fluxo.
      }
      return next;
    });
  }

  const validation = useMemo(
    () => validateAssessment(assessmentInputFromForm(person.key, form)),
    [form, person.key],
  );
  const proposal = useMemo(() => {
    if (!validation.assessment) return null;
    return createDietProposal(validation.assessment, experimentalV1Policy, person.meals);
  }, [person.meals, validation.assessment]);

  if (!dietFlags.questionnaire) return <Navigate to={`/${person.key}`} replace />;

  const heightValue = parseBrazilianDecimal(form.height);
  const heightCm = convertHeightToCentimeters(
    heightValue,
    form.heightUnit === "m" ? "m" : "cm",
  );
  const showHeightReview = form.heightUnit === "m" && Number.isFinite(heightCm);
  const canApply = Boolean(validation.valid && proposal?.daily && !applied);

  function apply() {
    if (!validation.assessment || !proposal?.daily || !validation.valid) return;
    const plan: DietPlan = {
      id: crypto.randomUUID(),
      personKey: person.key,
      origin: "confirmed",
      policyId: proposal.policyId,
      assessment: validation.assessment,
      catalogVersion: CATALOG_VERSION,
      createdAt: new Date().toISOString(),
      daily: proposal.daily,
      meals: proposal.meals,
    };
    const outcome = diet.confirmProposal(plan);
    if (!outcome?.persisted || !outcome.result.effectiveDate) return;
    clearDietDraft(browserDraftStorage(), person.key);
    setApplied(outcome.result.effectiveDate);
  }

  const goalLabel = GOALS.find((item) => item.value === form.goal)?.label ?? "Não informado";
  const activity = ACTIVITIES.find((item) => item.value === form.activityLevel);

  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="grid gap-2">
        <p className="m-0 text-sm font-medium text-guide-accent-ink">
          Questionário de {person.name}
        </p>
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">
          Calcule sua dieta
        </h1>
        <p className="m-0 text-sm text-guide-muted">
          Etapa {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>
      </header>

      <ol className="m-0 flex list-none gap-1 p-0" aria-label="Etapas do questionário">
        {STEPS.map((label, index) => (
          <li key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-guide-line">
            <span
              className={`block h-full ${index <= step ? "bg-guide-accent" : ""}`}
              aria-hidden="true"
            />
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-guide-body">
            Idade em anos completos
            <input
              inputMode="numeric"
              value={form.ageYears}
              onChange={(event) => update({ ageYears: event.target.value })}
              aria-invalid={entryInvalid(validation.issues, "ageYears") || undefined}
              className={fieldClass}
            />
          </label>
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="text-sm text-guide-body">Altura</legend>
            <div className="flex gap-2">
              {(["cm", "m"] as const).map((unit) => (
                <label
                  key={unit}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-card bg-guide-chip px-3 text-sm has-checked:bg-guide-accent has-checked:font-medium"
                >
                  <input
                    type="radio"
                    name="height-unit"
                    checked={form.heightUnit === unit}
                    onChange={() => update({ heightUnit: unit })}
                  />
                  {unit === "cm" ? "centímetros" : "metros"}
                </label>
              ))}
            </div>
            <input
              inputMode="decimal"
              value={form.height}
              onChange={(event) => update({ height: event.target.value })}
              aria-label="Valor da altura"
              aria-invalid={entryInvalid(validation.issues, "height") || undefined}
              className={fieldClass}
            />
            {showHeightReview ? (
              <p className="m-0 rounded-card bg-guide-selected px-3 py-2 text-sm text-guide-accent-ink">
                Altura para conferência: {decimal.format(heightCm)} cm
              </p>
            ) : null}
          </fieldset>
          <label className="grid gap-1.5 text-sm text-guide-body">
            Peso atual em quilogramas
            <input
              inputMode="decimal"
              value={form.weightKg}
              onChange={(event) => update({ weightKg: event.target.value })}
              aria-invalid={entryInvalid(validation.issues, "weightKg") || undefined}
              className={fieldClass}
            />
          </label>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-sm text-guide-body">Coeficiente da equação</legend>
            {(
              [
                ["male", "Coeficiente masculino"],
                ["female", "Coeficiente feminino"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="equation"
                  checked={form.equationCoefficient === value}
                  onChange={() => update({ equationCoefficient: value })}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="grid gap-4">
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 text-sm text-guide-body">Objetivo</legend>
            {GOALS.map((item) => (
              <label key={item.value} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="goal"
                  checked={form.goal === item.value}
                  onChange={() => update({ goal: item.value })}
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 text-sm text-guide-body">Atividade geral</legend>
            {ACTIVITIES.map((item) => (
              <label key={item.value} className="grid gap-0.5 text-sm">
                <span className="flex min-h-10 items-center gap-2">
                  <input
                    type="radio"
                    name="activity"
                    checked={form.activityLevel === item.value}
                    onChange={() => update({ activityLevel: item.value })}
                  />
                  {item.label}
                </span>
                <span className="pl-6 text-guide-muted">{item.detail}</span>
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1.5 text-sm text-guide-body">
            Peso desejado em quilogramas (opcional)
            <input
              inputMode="decimal"
              value={form.desiredWeightKg}
              onChange={(event) => update({ desiredWeightKg: event.target.value })}
              aria-invalid={entryInvalid(validation.issues, "desiredWeightKg") || undefined}
              className={fieldClass}
            />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-4">
          <FoodChecks
            legend="Alimentos preferidos"
            foods={foods}
            selected={form.preferredFoodIds}
            onToggle={(id) =>
              update({
                preferredFoodIds: toggleId(form.preferredFoodIds, id),
                avoidedFoodIds: form.avoidedFoodIds.filter((item) => item !== id),
              })
            }
          />
          <FoodChecks
            legend="Alimentos que não consome"
            foods={foods}
            selected={form.avoidedFoodIds}
            onToggle={(id) =>
              update({
                avoidedFoodIds: toggleId(form.avoidedFoodIds, id),
                preferredFoodIds: form.preferredFoodIds.filter((item) => item !== id),
              })
            }
          />
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.avoidedGroups.includes("fruit")}
              onChange={() => {
                const next: FoodTag[] = form.avoidedGroups.includes("fruit") ? [] : ["fruit"];
                update({ avoidedGroups: next });
              }}
            />
            Não consome frutas
          </label>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-sm text-guide-body">Alergias e intolerâncias</legend>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="radio"
                name="allergy-mode"
                checked={form.allergyMode === "none_reported"}
                onChange={() => update({ allergyMode: "none_reported", allergyItems: [] })}
              />
              Nenhuma informada
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="radio"
                name="allergy-mode"
                checked={form.allergyMode === "reported"}
                onChange={() => update({ allergyMode: "reported" })}
              />
              Informar
            </label>
            {form.allergyMode === "reported"
              ? SUPPORTED_RESTRICTIONS.map((item) => (
                  <label key={item} className="flex min-h-10 items-center gap-2 pl-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allergyItems.includes(item)}
                      onChange={() =>
                        update({ allergyItems: toggleId(form.allergyItems, item) as SupportedRestriction[] })
                      }
                    />
                    {RESTRICTION_LABEL[item]}
                  </label>
                ))
              : null}
          </fieldset>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-sm text-guide-body">Gestação ou amamentação</legend>
            <YesNo
              name="pregnant"
              value={form.pregnantOrLactating}
              onChange={(value) => update({ pregnantOrLactating: value })}
            />
          </fieldset>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-sm text-guide-body">Dieta terapêutica específica</legend>
            <YesNo
              name="therapeutic"
              value={form.therapeuticDietRequired}
              onChange={(value) => update({ therapeuticDietRequired: value })}
            />
          </fieldset>
          <label className="grid gap-1.5 text-sm text-guide-body">
            Observação livre (não cria restrição)
            <textarea
              value={form.freeTextNote}
              onChange={(event) => update({ freeTextNote: event.target.value })}
              aria-invalid={entryInvalid(validation.issues, "freeTextNote") || undefined}
              className={`${fieldClass} min-h-24 py-3`}
            />
          </label>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-3">
          <p className="m-0 text-sm text-guide-muted">
            As cinco refeições permanecem. Ajuste a participação de cada uma. A soma precisa ser 100%.
          </p>
          {mealsInOrder(person.meals).map((meal) => (
            <label key={meal.key} className="grid gap-1.5 text-sm text-guide-body">
              {meal.label} (%)
              <input
                inputMode="decimal"
                value={form.mealPercents[meal.key]}
                onChange={(event) =>
                  update({
                    mealPercents: {
                      ...form.mealPercents,
                      [meal.key]: event.target.value,
                    },
                  })
                }
                aria-invalid={percentEntryInvalid(form.mealPercents[meal.key]) || undefined}
                className={fieldClass}
              />
            </label>
          ))}
        </section>
      ) : null}

      {step === 4 ? (
        <section className="grid gap-4">
          <ReviewList
            rows={[
              ["Perfil", person.name],
              ["Idade", form.ageYears ? `${form.ageYears} anos` : ""],
              ["Altura", showHeightReview ? `${decimal.format(heightCm)} cm` : form.height ? `${form.height} ${form.heightUnit}` : ""],
              ["Peso", form.weightKg ? `${form.weightKg} kg` : ""],
              ["Coeficiente", form.equationCoefficient === "male" ? "Masculino" : form.equationCoefficient === "female" ? "Feminino" : ""],
              ["Objetivo", goalLabel],
              ["Atividade", activity?.label ?? ""],
            ]}
          />
          {validation.issues.length > 0 ? (
            <ul className="m-0 grid list-none gap-2 p-0">
              {validation.issues.map((issue) => (
                <li key={`${issue.field}-${issue.code}`} className="rounded-card bg-guide-danger-bg px-3 py-2 text-sm text-guide-danger" role="alert">
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {!validation.estimationCompleted || !proposal?.daily ? (
            <p className="m-0 text-sm text-guide-body" role="status">
              {ESTIMATE_NOT_COMPLETED}
            </p>
          ) : null}
          {proposal?.daily ? (
            <ProposalCard
              calories={proposal.daily.calories}
              protein={proposal.daily.proteinGrams}
              carbohydrate={proposal.daily.carbohydrateGrams}
              fat={proposal.daily.fatGrams}
              goal={goalLabel}
              meals={proposal.meals.map((meal) => ({
                key: meal.mealKey,
                label: person.meals.find((item) => item.key === meal.mealKey)?.label ?? meal.mealKey,
                share: meal.share,
              }))}
              activityLabel={activity?.label ?? ""}
              activityFactor={form.activityLevel ? experimentalV1Policy.activityFactors[form.activityLevel] : null}
              goalFactor={form.goal ? experimentalV1Policy.goalMultipliers[form.goal] : null}
              macro={
                form.goal
                  ? experimentalV1Policy.macroPresetsPercent[form.goal]
                  : null
              }
              resting={proposal.estimate.restingCalories}
              expenditure={proposal.estimate.dailyExpenditureCalories}
              raw={proposal.estimate.rawTargetCalories}
              diagnostics={proposal.diagnostics.map((item) => item.message)}
              coefficient={form.equationCoefficient}
            />
          ) : proposal && proposal.diagnostics.length > 0 ? (
            <ul className="m-0 grid list-none gap-2 p-0">
              {proposal.diagnostics.map((item) => (
                <li key={item.code} className="rounded-card bg-guide-danger-bg px-3 py-2 text-sm text-guide-danger">
                  {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          {applied ? (
            <p className="m-0 rounded-card bg-guide-success-bg px-3 py-2 text-sm text-guide-success" role="status">
              {applied === diet.today
                ? `Plano em vigor hoje, ${formatWhen(applied)}.`
                : `O dia já tem consumo. O plano passa a valer em ${formatWhen(applied)} (${applied}).`}
            </p>
          ) : null}
          <div className="grid gap-2">
            <button type="button" className={primaryButton} disabled={!canApply} onClick={apply}>
              Aplicar ao meu perfil
            </button>
            <button type="button" className={quietButton} onClick={() => setStep(0)}>
              Editar respostas
            </button>
            <Link to={`/${person.key}`} className={quietButton}>
              Cancelar
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={quietButton}
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Voltar
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
          >
            Continuar
          </button>
          <Link to={`/${person.key}`} className={`${quietButton} col-span-2`}>
            Cancelar
          </Link>
        </div>
      )}
    </main>
  );
}

function YesNo({
  name,
  value,
  onChange,
}: {
  name: string;
  value: "" | "yes" | "no";
  onChange: (value: "" | "yes" | "no") => void;
}) {
  return (
    <div className="flex gap-3">
      {(
        [
          ["no", "Não"],
          ["yes", "Sim"],
        ] as const
      ).map(([option, label]) => (
        <label key={option} className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function FoodChecks({
  legend,
  foods,
  selected,
  onToggle,
}: {
  legend: string;
  foods: { id: string; name: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-sm text-guide-body">{legend}</legend>
      <div className="grid max-h-40 gap-1 overflow-auto rounded-card bg-guide-card p-2 shadow-card">
        {foods.map((food) => (
          <label key={food.id} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(food.id)}
              onChange={() => onToggle(food.id)}
            />
            {food.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid gap-2 rounded-card bg-guide-card p-4 shadow-card">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
          <dt className="text-guide-muted">{label}</dt>
          <dd className="m-0 text-right font-medium">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProposalCard({
  calories,
  protein,
  carbohydrate,
  fat,
  goal,
  meals,
  activityLabel,
  activityFactor,
  goalFactor,
  macro,
  resting,
  expenditure,
  raw,
  diagnostics,
  coefficient,
}: {
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  goal: string;
  meals: { key: MealKey; label: string; share: number }[];
  activityLabel: string;
  activityFactor: number | null;
  goalFactor: number | null;
  macro: { carbohydrate: number; protein: number; fat: number } | null;
  resting: number;
  expenditure: number;
  raw: number;
  diagnostics: readonly string[];
  coefficient: string;
}) {
  const equation = experimentalV1Policy.mifflinStJeor;
  const intercept = coefficient === "female" ? equation.femaleIntercept : equation.maleIntercept;
  return (
    <section className="grid gap-3 rounded-card bg-guide-card p-4 shadow-card">
      <h2 className="m-0 text-lg font-medium">Proposta</h2>
      <p className="m-0 font-display text-[28px] leading-none tabular-nums">{formatKcal(calories)}</p>
      <ul className="m-0 grid list-none gap-1 p-0 text-sm">
        <li>Proteínas: {decimal.format(protein)} g</li>
        <li>Carboidratos: {decimal.format(carbohydrate)} g</li>
        <li>Gorduras: {decimal.format(fat)} g</li>
        <li>Objetivo: {goal}</li>
      </ul>
      <ul className="m-0 grid list-none gap-1 p-0 text-sm">
        {meals.map((meal) => (
          <li key={meal.key} className="flex justify-between gap-2">
            <span>{meal.label}</span>
            <span className="tabular-nums">{decimal.format(meal.share * 100)}%</span>
          </li>
        ))}
      </ul>
      <details className="rounded-card bg-guide-paper px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Como foi calculado</summary>
        <div className="mt-2 grid gap-2 text-guide-body">
          <p className="m-0">
            Equação Mifflin–St Jeor: {equation.weightPerKg} × peso (kg) + {decimal.format(equation.heightPerCm)} × altura (cm) + {equation.agePerYear} × idade + {intercept}.
          </p>
          <p className="m-0">
            Gasto em repouso estimado: {decimal.format(resting)} kcal. Gasto diário estimado: {decimal.format(expenditure)} kcal.
          </p>
          <p className="m-0">
            Atividade: {activityLabel || "não informada"}
            {activityFactor != null ? `, multiplicador ${decimal.format(activityFactor)}` : ""}.
          </p>
          <p className="m-0">
            Ajuste do objetivo: {goal}
            {goalFactor != null ? `, multiplicador ${decimal.format(goalFactor)}` : ""}. Meta bruta: {decimal.format(raw)} kcal.
          </p>
          {macro ? (
            <p className="m-0">
              Política de macros experimental-v1: carboidrato {macro.carbohydrate}%, proteína {macro.protein}%, gordura {macro.fat}%.
            </p>
          ) : null}
          <p className="m-0">
            Limites aplicados: {diagnostics.length > 0 ? diagnostics.join(" ") : "Nenhum piso, conflito ou teto foi aplicado."}
          </p>
        </div>
      </details>
      <p className="m-0 text-sm text-guide-muted">{EXPERIMENTAL_DISCLAIMER}</p>
    </section>
  );
}
