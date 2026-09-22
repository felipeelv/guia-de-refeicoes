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
      className={`relative flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-3 pr-10 transition-[border-color,background-color,transform] duration-150 active:scale-[0.985] ${
        selected
          ? "border-guide-accent bg-guide-selected"
          : "border-guide-line bg-guide-card hover:border-guide-accent/50"
      } ${className}`}
    >
      {input}
      <span
        className={`pointer-events-none absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border-2 transition-[background-color,border-color] duration-150 ${
          selected
            ? "border-guide-accent bg-guide-accent text-white"
            : "border-guide-line bg-guide-card text-transparent"
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
  selectedId,
  onChange,
  noneLabel,
  action,
}: {
  legend: string;
  name: string;
  foods: Food[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
  noneLabel?: string;
  action?: ReactNode;
}) {
  const inputClass =
    "peer absolute top-3 right-3 size-5 cursor-pointer appearance-none rounded-full";
  const legendId = useId();
  return (
    <div role="group" aria-labelledby={legendId}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <span
          id={legendId}
          className="text-xs font-bold tracking-[0.18em] text-guide-muted uppercase"
        >
          {legend}
        </span>
        {action}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {noneLabel ? (
          <Tile
            selected={selectedId === null}
            className="col-span-2 min-h-12 justify-center"
            input={
              <input
                type="radio"
                name={name}
                value=""
                checked={selectedId === null}
                onChange={() => onChange(null)}
                className={inputClass}
              />
            }
          >
            <span className="font-bold">{noneLabel}</span>
          </Tile>
        ) : null}
        {foods.map((food) => {
          const selected = selectedId === food.id;
          return (
            <Tile
              key={food.id}
              selected={selected}
              className="min-h-20"
              input={
                <input
                  type="radio"
                  name={name}
                  value={food.id}
                  checked={selected}
                  onChange={() => onChange(food.id)}
                  className={inputClass}
                />
              }
            >
              <span className="leading-tight font-bold text-pretty">{food.name}</span>
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
