import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { MealBuilderScreen } from "../components/MealBuilder.tsx";
import { foodsByCategory } from "../catalog/catalog.ts";
import { useCatalog } from "../catalog/context.tsx";
import { catalogWithSaved } from "../catalog/library.ts";
import { mealByKey } from "../catalog/meals.ts";
import { useOptionalDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import { allowsSecondProtein, foodsForMealSlot, resolveMealSelection } from "../diet/meal-selection.ts";
import type { Person } from "../domain/types.ts";

export function MealBuilderPage() {
  const person = useOutletContext<Person>();
  const { foods } = useCatalog();
  const { mealKey } = useParams();
  const meal = mealByKey(mealKey, person.meals);
  const [params, setParams] = useSearchParams();
  const diet = useOptionalDiet();
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
  const personalized = Boolean(
    dietFlags.macroSolver && diet?.effective?.origin === "confirmed",
  );
  const assessment = personalized ? (diet?.effective?.assessment ?? null) : null;
  const availableFoods = catalogWithSaved(foods, diet?.profile.savedFoodIds ?? []);
  const carbohydrates = personalized
    ? foodsForMealSlot({
        category: "carbohydrate",
        mealKey: meal.key,
        person,
        foods: availableFoods,
        assessment,
      })
    : foodsByCategory("carbohydrate", meal.key, person.excludedTags, availableFoods);
  const proteins = personalized
    ? foodsForMealSlot({
        category: "protein",
        mealKey: meal.key,
        person,
        foods: availableFoods,
        assessment,
      })
    : foodsByCategory("protein", meal.key, person.excludedTags, availableFoods);
  const resolved = resolveMealSelection({
    mealKey: meal.key,
    carb: params.get("carb"),
    carb2: params.get("carb2"),
    protein: params.get("protein"),
    protein2: params.get("protein2"),
    carbohydrates,
    proteins,
  });
  const currentMeal = meal;
  function writePair(
    primaryKey: "carb" | "protein",
    secondKey: "carb2" | "protein2",
    primary: string | null,
    second: string | null,
  ) {
    const next = new URLSearchParams(params);
    if (primary) next.set(primaryKey, primary);
    else next.delete(primaryKey);
    if (second) next.set(secondKey, second);
    else next.delete(secondKey);
    if (!allowsSecondProtein(currentMeal.key)) next.delete("protein2");
    setParams(next, { replace: true });
  }
  return (
    <MealBuilderScreen
      person={person}
      meal={meal}
      carbohydrates={carbohydrates}
      proteins={proteins}
      carbohydrateId={resolved.carbohydrateId}
      secondCarbohydrateId={resolved.carbohydrate2Id}
      proteinId={resolved.proteinId}
      secondProteinId={resolved.protein2Id}
      onCarbohydrateSelectionChange={(primary, second) =>
        writePair("carb", "carb2", primary, second)
      }
      onProteinSelectionChange={(primary, second) =>
        writePair("protein", "protein2", primary, second)
      }
    />
  );
}
