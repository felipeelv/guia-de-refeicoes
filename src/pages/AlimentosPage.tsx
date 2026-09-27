import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import { catalogWithSaved, searchLibrary } from "../catalog/library.ts";
import { useDiet } from "../diet/DietContext.tsx";
import { dietFlags } from "../diet/flags.ts";
import { foodsEnteringMenu } from "../diet/meal-selection.ts";
import type { Food, Person } from "../domain/types.ts";

const fieldClass =
  "box-border min-h-[50px] w-full rounded-card border-2 border-solid border-guide-muted bg-guide-paper px-4 py-3 font-sans text-base text-guide-ink ring-offset-2 ring-offset-guide-paper focus-visible:border-guide-focus focus-visible:ring-2 focus-visible:ring-guide-focus";

export function AlimentosScreen({
  personName,
  menu,
  savedIds,
  query,
  results,
  allowedIds,
  onQuery,
  onSave,
  onRemove,
}: {
  personName: string;
  menu: readonly Food[];
  savedIds: readonly string[];
  query: string;
  results: readonly Food[];
  allowedIds: ReadonlySet<string>;
  onQuery: (value: string) => void;
  onSave: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const saved = new Set(savedIds);
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="grid gap-1">
        <h1 className="font-display m-0 text-[28px] leading-[1.3] text-pretty">Alimentos</h1>
        <p className="m-0 text-sm text-guide-muted">
          Cardápio de {personName}
        </p>
      </header>
      <section className="grid gap-3" aria-labelledby="alimentos-do-cardapio">
        <h2 id="alimentos-do-cardapio" className="m-0 text-lg font-medium">
          No cardápio
        </h2>
        {menu.length === 0 ? (
          <p className="m-0 text-sm text-guide-muted">Nenhum alimento neste cardápio.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {menu.map((food) => (
              <li
                key={food.id}
                className="grid gap-2 rounded-card bg-guide-card p-4 shadow-card"
              >
                <p className="m-0 font-medium text-guide-ink">{food.name}</p>
                <p className="m-0 text-sm text-guide-muted">{food.preparation}</p>
                {saved.has(food.id) ? (
                  <button
                    type="button"
                    onClick={() => onRemove(food.id)}
                    className="min-h-10 cursor-pointer justify-self-start rounded-card border-0 bg-transparent px-0 text-sm font-medium text-guide-accent-ink hover:underline"
                  >
                    Remover {food.name}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium text-guide-ink">
          Buscar alimento
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className={fieldClass}
          />
        </label>
        {query.trim() ? (
          results.length === 0 ? (
            <p className="m-0 text-sm text-guide-muted" role="status">
              Nenhum alimento na biblioteca.
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {results.map((food) => {
                const already = saved.has(food.id);
                const allowed = allowedIds.has(food.id);
                return (
                  <li
                    key={food.id}
                    className="grid gap-2 rounded-card bg-guide-card p-4 shadow-card"
                  >
                    <p className="m-0 font-medium text-guide-ink">{food.name}</p>
                    <p className="m-0 text-sm text-guide-muted">{food.preparation}</p>
                    {already ? (
                      <p className="m-0 text-sm text-guide-muted">Já está no cardápio.</p>
                    ) : allowed ? (
                      <button
                        type="button"
                        onClick={() => onSave(food.id)}
                        className="inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-card border-0 bg-guide-primary px-4 font-bold text-white hover:bg-guide-primary-hover"
                      >
                        Salvar {food.name}
                      </button>
                    ) : (
                      <p className="m-0 text-sm text-guide-muted">
                        Fora do cardápio desta pessoa.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </section>
    </main>
  );
}

export function AlimentosPage() {
  const person = useOutletContext<Person>();
  const { foods } = useCatalog();
  const diet = useDiet();
  const [query, setQuery] = useState("");
  const savedIds = diet.profile.savedFoodIds ?? [];
  const available = catalogWithSaved(foods, savedIds);
  const personalized = Boolean(
    dietFlags.macroSolver && diet.effective?.origin === "confirmed",
  );
  const assessment = personalized ? (diet.effective?.assessment ?? null) : null;
  const menu = foodsEnteringMenu({
    person,
    foods: available,
    personalized,
    assessment,
  });
  const results = searchLibrary(query);
  const allowedIds = new Set(
    foodsEnteringMenu({
      person,
      foods: results,
      personalized,
      assessment,
    }).map((food) => food.id),
  );
  return (
    <AlimentosScreen
      personName={person.name}
      menu={menu}
      savedIds={savedIds}
      query={query}
      results={results}
      allowedIds={allowedIds}
      onQuery={setQuery}
      onSave={(id) => {
        diet.saveLibraryFood(id);
      }}
      onRemove={(id) => {
        diet.removeLibraryFood(id);
      }}
    />
  );
}
