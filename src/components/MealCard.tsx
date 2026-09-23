import { Link } from "react-router-dom";
import type { MealConfig, PersonKey } from "../domain/types.ts";
import { MEAL_VISUALS } from "./MealVisuals.tsx";

export function MealCard({
  meal,
  personKey,
  wide,
}: {
  meal: MealConfig;
  personKey: PersonKey;
  wide?: boolean;
}) {
  const visual = MEAL_VISUALS[meal.key];
  return (
    <Link
      to={`/${personKey}/refeicoes/${meal.key}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl shadow-card transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
        wide ? "min-h-32" : "min-h-52"
      }`}
    >
      <img
        src={visual.image}
        alt=""
        width={460}
        height={460}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/5"
      />
      <span className="relative m-3 flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm">
        {visual.icon}
      </span>
      <span
        className={`relative mt-auto flex flex-col gap-0.5 p-4 pt-3 text-white ${
          wide ? "max-w-[62%]" : ""
        }`}
      >
        <span className="font-display text-lg leading-tight text-pretty">
          {meal.label}
        </span>{" "}
        <span className="text-xs leading-snug text-white/85 text-pretty">
          {visual.descriptor}
        </span>
      </span>
    </Link>
  );
}
