import type { Food } from "../domain/types.ts";

export function FoodSelector({
  legend,
  name,
  foods,
  selectedId,
  onChange,
  noneLabel,
}: {
  legend: string;
  name: string;
  foods: Food[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
  noneLabel?: string;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-xs font-bold tracking-[0.18em] text-guide-muted uppercase">
        {legend}
      </legend>
      <div className="grid gap-2">
        {noneLabel ? (
          <label
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-[border-color,background-color] duration-150 ${
              selectedId === null
                ? "border-guide-accent bg-guide-selected"
                : "border-guide-line bg-guide-card hover:border-guide-accent/50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value=""
              checked={selectedId === null}
              onChange={() => onChange(null)}
              className="size-5 shrink-0 accent-guide-accent"
            />
            <span className="font-bold">{noneLabel}</span>
          </label>
        ) : null}
        {foods.map((food) => {
          const selected = selectedId === food.id;
          return (
            <label
              key={food.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-[border-color,background-color] duration-150 ${
                selected
                  ? "border-guide-accent bg-guide-selected"
                  : "border-guide-line bg-guide-card hover:border-guide-accent/50"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={food.id}
                checked={selected}
                onChange={() => onChange(food.id)}
                className="size-5 shrink-0 accent-guide-accent"
              />
              <span className="min-w-0">
                <span className="block font-bold">{food.name}</span>
                <span className="block text-sm text-guide-muted">
                  {food.preparation}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
