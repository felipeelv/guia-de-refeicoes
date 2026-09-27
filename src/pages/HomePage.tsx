import { Link, useOutletContext } from "react-router-dom";
import { MealCard } from "../components/MealCard.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import { useOptionalDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import type { Person } from "../domain/types.ts";

function formatConfiguredAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function DietCard({ person }: { person: Person }) {
  const diet = useOptionalDiet();
  const plan = diet?.latestConfirmedPlan ?? null;
  const showQuestions = dietFlags.questionnaire;
  if (!showQuestions && !plan) return null;
  const actionClass =
    "inline-flex min-h-[50px] items-center justify-center rounded-card bg-guide-primary px-4 text-center font-bold text-white no-underline hover:bg-guide-primary-hover";
  const quietClass =
    "inline-flex min-h-[50px] items-center justify-center rounded-card bg-guide-card px-4 text-center font-medium text-guide-ink no-underline shadow-card";
  return (
    <section className="grid gap-3 rounded-card bg-guide-card p-5 shadow-card">
      <h2 className="m-0 text-lg font-medium">Calcule sua dieta</h2>
      <p className="m-0 text-sm text-guide-body text-pretty">
        Responda algumas perguntas para personalizar suas metas e porções
      </p>
      {plan ? (
        <p className="m-0 text-sm text-guide-muted">
          Última configuração: {formatConfiguredAt(plan.createdAt)}
        </p>
      ) : null}
      <div className="grid gap-2">
        {plan ? (
          <Link to={`/${person.key}/minha-dieta`} className={actionClass}>
            Minha dieta
          </Link>
        ) : null}
        {showQuestions ? (
          <Link
            to={`/${person.key}/calcular-dieta`}
            className={plan ? quietClass : actionClass}
          >
            {plan ? "Recalcular" : "Começar"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function HomeScreen({ person }: { person: Person }) {
  const meals = mealsInOrder(person.meals);
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="relative grid gap-2 overflow-hidden rounded-card bg-guide-hero-deep px-5 py-6 text-guide-ink">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-12 size-44 rounded-full bg-guide-hero/70"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-4 -bottom-16 size-32 rounded-full bg-white/25"
        />
        <p className="relative m-0 text-sm font-medium">Ficha de porções</p>
        <h1 className="font-display relative m-0 max-w-[14ch] text-[28px] leading-[1.3] text-pretty">
          Cardápio de {person.name}
        </h1>
        <p className="relative m-0 max-w-[30ch] text-sm text-guide-ink/80 text-pretty">
          Escolha uma refeição para calcular as porções.
        </p>
      </header>
      <DietCard person={person} />
      <section className="grid gap-4">
        <h2 className="m-0 text-lg font-medium">Refeições do dia</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
          {meals.map((meal, index) => {
            const wide = index === meals.length - 1 && meals.length % 2 === 1;
            return (
              <li key={meal.key} className={`rise ${wide ? "col-span-2" : ""}`}>
                <MealCard meal={meal} personKey={person.key} wide={wide} />
              </li>
            );
          })}
        </ul>
      </section>
      <p className="m-0 text-sm text-guide-muted text-pretty">
        Os valores são estimativas de consulta e não substituem orientação
        profissional.
      </p>
    </main>
  );
}

export function HomePage() {
  const person = useOutletContext<Person>();
  return <HomeScreen person={person} />;
}
