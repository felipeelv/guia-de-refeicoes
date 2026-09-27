import { Link, useOutletContext } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import { EXPERIMENTAL_DISCLAIMER } from "../diet/copy.ts";
import { useDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import { formatMagnitude } from "../diet/nutrient-display.ts";
import type { DietPlan, Person } from "../domain/types.ts";

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString(
    "pt-BR",
    { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" },
  );
}

const buttonClass =
  "inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-card border-0 bg-guide-card px-4 font-medium text-guide-ink no-underline shadow-card";

export function MyDietPage() {
  const adjusted = useOutletContext<Person>();
  const { persons } = useCatalog();
  const person = persons.find((item) => item.key === adjusted.key) ?? adjusted;
  const diet = useDiet();
  const plan = diet.latestConfirmedPlan;
  const others = diet.profile.plans.filter(
    (item) => item.origin === "confirmed" && item.id !== plan?.id,
  );

  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="grid gap-2">
        <p className="m-0 text-sm font-medium text-guide-accent-ink">Perfil de {person.name}</p>
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">Minha dieta</h1>
      </header>
      {plan ? <PlanCard plan={plan} person={person} /> : (
        <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
          <p className="m-0 text-sm text-guide-body">Nenhuma dieta confirmada ainda.</p>
          {dietFlags.questionnaire ? (
            <Link to={`/${person.key}/calcular-dieta`} className={buttonClass}>
              Começar
            </Link>
          ) : null}
        </section>
      )}
      {diet.scheduledActivation ? (
        <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
          <h2 className="m-0 text-lg font-medium">Proposta agendada</h2>
          <p className="m-0 text-sm text-guide-body">
            Passa a valer em {formatDay(diet.scheduledActivation.effectiveDate)}. Até lá, o plano de hoje continua.
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => diet.cancelScheduled(diet.scheduledActivation!.id)}
          >
            Cancelar proposta agendada
          </button>
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="m-0 text-lg font-medium">Planos anteriores</h2>
          {others.map((item) => (
            <button
              key={item.id}
              type="button"
              className={buttonClass}
              onClick={() => diet.restorePlan(item.id)}
            >
              Restaurar plano de {formatWhen(item.createdAt)}
            </button>
          ))}
        </section>
      ) : null}
      <p className="m-0 text-sm text-guide-muted">{EXPERIMENTAL_DISCLAIMER}</p>
      <Link to={`/${person.key}`} className={buttonClass}>
        Voltar ao cardápio
      </Link>
    </main>
  );
}

function PlanCard({ plan, person }: { plan: DietPlan; person: Person }) {
  return (
    <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
      <p className="m-0 text-sm text-guide-muted">
        Última configuração: {formatWhen(plan.createdAt)}
      </p>
      <p className="m-0 font-display text-[28px] leading-none tabular-nums">
        {formatMagnitude(plan.daily.calories, "kcal")}
      </p>
      <ul className="m-0 grid list-none gap-1 p-0 text-sm">
        <li>Proteínas: {decimal.format(plan.daily.proteinGrams)} g</li>
        <li>Carboidratos: {decimal.format(plan.daily.carbohydrateGrams)} g</li>
        <li>Gorduras: {decimal.format(plan.daily.fatGrams)} g</li>
      </ul>
      <ul className="m-0 grid list-none gap-1 p-0 text-sm">
        {plan.meals.map((meal) => (
          <li key={meal.mealKey} className="flex justify-between gap-2">
            <span>{person.meals.find((item) => item.key === meal.mealKey)?.label ?? meal.mealKey}</span>
            <span className="tabular-nums">{decimal.format(meal.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
