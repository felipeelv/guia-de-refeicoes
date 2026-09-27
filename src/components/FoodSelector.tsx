import { useId, type ReactNode } from "react";
import type { Food } from "../domain/types.ts";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 5 5L19 7" />
    </svg>
  );
}

function Tile({
  selected,
  children,
  className = "",
  input,
}: {
  selected: boolean;
  children: ReactNode;
  className?: string;
  input: ReactNode;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-1 rounded-card border-2 p-3 pr-10 shadow-card transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.985] ${
        selected
          ? "border-guide-accent bg-guide-selected"
          : "border-transparent bg-guide-card hover:border-guide-accent/40"
      } ${className}`}
    >
      {input}
      <span
        className={`pointer-events-none absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border-2 transition-[background-color,border-color] duration-150 ${
          selected
            ? "animate-pop border-guide-accent bg-guide-accent text-guide-ink"
            : "border-guide-muted/40 bg-guide-card text-transparent"
        }`}
        aria-hidden="true"
      >
        <CheckIcon />
      </span>
      {children}
    </label>
  );
}

export function FoodSelector({
  legend,
  name,
  foods,
  selectedIds,
  max,
  onToggle,
}: {
  legend: string;
  name: string;
  foods: Food[];
  selectedIds: readonly string[];
  max: number;
  onToggle: (id: string) => void;
}) {
  const inputClass =
    "peer absolute top-3 right-3 size-5 cursor-pointer appearance-none rounded-full";
  const legendId = useId();
  const atCapacity = selectedIds.length >= max;
  return (
    <div role="group" aria-labelledby={legendId}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <span id={legendId} className="text-lg font-medium text-guide-ink">
          {legend}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {foods.map((food) => {
          const order = selectedIds.indexOf(food.id);
          const selected = order >= 0;
          return (
            <Tile
              key={food.id}
              selected={selected}
              className="min-h-20"
              input={
                <input
                  type="checkbox"
                  name={name}
                  value={food.id}
                  checked={selected}
                  onClick={(event) => {
                    if (!selected && atCapacity) event.preventDefault();
                  }}
                  onChange={() => {
                    if (!selected && atCapacity) return;
                    onToggle(food.id);
                  }}
                  className={inputClass}
                />
              }
            >
              <span className="leading-tight font-medium text-pretty text-guide-ink">
                {food.name}
              </span>
              {selected && max > 1 ? (
                <span className="sr-only">{order === 0 ? "primeiro" : "segundo"}</span>
              ) : null}
              <span className="line-clamp-2 text-xs leading-snug text-guide-muted">
                {food.preparation}
              </span>
            </Tile>
          );
        })}
      </div>
    </div>
  );
}
