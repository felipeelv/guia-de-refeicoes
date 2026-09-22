import { Link } from "react-router-dom";
import type { MealConfig, PersonKey } from "../domain/types.ts";
import { formatKcal } from "../format.ts";
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
      className={`relative flex h-full flex-col overflow-hidden rounded-3xl ${visual.surface} ${
        wide ? "min-h-32" : "min-h-52"
      } p-4 text-guide-ink no-underline transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0`}
    >
      <img
        src={visual.image}
        alt=""
        width={460}
        height={460}
        loading="lazy"
        decoding="async"
        className={`pointer-events-none absolute top-0 right-0 h-full object-cover [mask-image:linear-gradient(to_left,black_72%,transparent)] ${
          wide ? "w-[38%]" : "w-[44%]"
        }`}
      />
      <span className={`relative ${visual.ink}`}>{visual.icon}</span>
      <span
        className={`relative mt-auto flex flex-col gap-0.5 pt-3 ${
          wide ? "max-w-[58%]" : "max-w-[62%]"
        }`}
      >
        <span className="font-display text-lg leading-tight text-pretty">
          {meal.label}
        </span>
        <span className="text-xs leading-snug text-guide-muted text-pretty">
          {" "}
          {visual.descriptor}
        </span>
        <span className="mt-1 text-lg font-bold tabular-nums">
          {" "}
          {formatKcal(meal.targetCalories)}
        </span>
      </span>
    </Link>
  );
}
