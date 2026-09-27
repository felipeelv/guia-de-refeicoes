import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { MealBuilderScreen } from "../components/MealBuilder.tsx";
import { foodsByCategory } from "../catalog/catalog.ts";
import { useCatalog } from "../catalog/context.tsx";
import { mealByKey } from "../catalog/meals.ts";
import type { Person } from "../domain/types.ts";

export function MealBuilderPage() {
  const person = useOutletContext<Person>();
  const { foods } = useCatalog();
  const { mealKey } = useParams();
  const meal = mealByKey(mealKey, person.meals);
  const [params, setParams] = useSearchParams();
  if (!meal) {
    return (
      <main className="mx-auto grid w-full max-w-md gap-5 px-5 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <p className="m-0 text-sm font-medium text-guide-accent-ink">
          Ficha de porções
        </p>
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">
          Refeição não encontrada
        </h1>
        <p className="m-0 text-guide-muted">
          Essa refeição não faz parte do guia. Escolha outra na lista.
        </p>
        <Link
          to={`/${person.key}`}
          className="inline-flex min-h-[50px] items-center justify-center rounded-card bg-guide-primary px-4 text-center font-bold text-white no-underline hover:bg-guide-primary-hover"
        >
          Escolher outra refeição
        </Link>
      </main>
    );
  }
  const carbohydrateId = params.get("carb");
  const secondCarbohydrateId = params.get("carb2");
  const proteinId = params.get("protein");
  function select(key: "carb" | "carb2" | "protein", id: string | null) {
    const next = new URLSearchParams(params);
    if (id === null) next.delete(key);
    else next.set(key, id);
    setParams(next, { replace: true });
  }
  return (
    <MealBuilderScreen
      person={person}
      meal={meal}
      carbohydrates={foodsByCategory("carbohydrate", meal.key, person.excludedTags, foods)}
      proteins={foodsByCategory("protein", meal.key, person.excludedTags, foods)}
      carbohydrateId={carbohydrateId}
      secondCarbohydrateId={secondCarbohydrateId}
      proteinId={proteinId}
      onCarbohydrateChange={(id) => select("carb", id)}
      onSecondCarbohydrateChange={(id) => select("carb2", id)}
      onProteinChange={(id) => select("protein", id)}
    />
  );
}
