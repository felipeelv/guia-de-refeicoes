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
      className={`group flex h-full overflow-hidden rounded-card bg-guide-card text-guide-ink no-underline shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 ${
        wide ? "flex-row items-center" : "flex-col"
      }`}
    >
      <span
        className={`relative block shrink-0 overflow-hidden bg-guide-line ${
          wide ? "m-2 size-24 rounded-card" : "aspect-[4/3] w-full"
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
        <span className="absolute top-2 left-2 flex size-8 items-center justify-center rounded-full bg-white/85 text-guide-accent-ink backdrop-blur-sm [&_svg]:size-5">
          {visual.icon}
        </span>
      </span>
      <span
        className={`flex min-w-0 flex-1 flex-col gap-0.5 ${
          wide ? "px-3 py-2" : "px-3.5 pt-3 pb-3.5"
        }`}
      >
        <span className="text-base leading-tight font-medium text-pretty">
          {meal.label}
        </span>{" "}
        <span className="text-xs leading-snug text-guide-muted text-pretty">
          {visual.descriptor}
        </span>
      </span>
    </Link>
  );
}
