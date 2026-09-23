import { useOutletContext } from "react-router-dom";
import { MealCard } from "../components/MealCard.tsx";
import { mealsInOrder } from "../catalog/meals.ts";
import type { Person } from "../domain/types.ts";

export function HomeScreen({ person }: { person: Person }) {
  const meals = mealsInOrder(person.meals);
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="grid gap-2">
        <p className="m-0 text-xs font-bold tracking-[0.2em] text-guide-accent uppercase">
          Ficha de porções
        </p>
        <h1 className="font-display m-0 text-5xl leading-tight text-pretty">
          Cardápio de {person.name}
        </h1>
        <p className="m-0 text-guide-muted text-pretty">
          Escolha uma refeição para calcular as porções.
        </p>
      </header>
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
