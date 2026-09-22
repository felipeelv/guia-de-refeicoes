import type { Food } from "../domain/types.ts";

export function DataSourceNotice({ foods }: { foods: Food[] }) {
  return (
    <div className="text-sm text-guide-muted">
      <p className="m-0 text-xs font-bold tracking-[0.16em] uppercase">
        Fonte nutricional
      </p>
      <ul className="mt-1 mb-0 list-none p-0">
        {foods.map((food) => (
          <li key={food.id} className="break-words">
            {food.name}: {food.source.name} {food.source.code}
            {food.source.url ? (
              <>
                {" "}
                <a
                  href={food.source.url}
                  className="font-bold text-guide-accent underline-offset-2 hover:underline"
                  rel="noreferrer"
                >
                  ficha
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
