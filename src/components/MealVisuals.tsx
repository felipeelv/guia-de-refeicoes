import type { ReactNode } from "react";
import type { MealKey } from "../domain/types.ts";

export interface MealVisual {
  descriptor: string;
  image: string;
  surface: string;
  gradient: string;
  ink: string;
  icon: ReactNode;
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...strokeProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
}

function CutleryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...strokeProps}>
      <path d="M7 2v8a2 2 0 0 0 4 0V2M9 10v12" />
      <path d="M16 2c2 2 2 5 0 7v13" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...strokeProps}>
      <path d="M4 20c0-8 6-14 16-15 1 11-5 16-12 16H4Z" />
      <path d="M9 19c1.5-4 4-7 7.5-9" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...strokeProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...strokeProps}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export const MEAL_VISUALS: Record<MealKey, MealVisual> = {
  breakfast: {
    descriptor: "Comece o dia",
    image: "/refeicoes/cafe-da-manha.jpg",
    surface: "bg-meal-breakfast",
    gradient: "bg-meal-breakfast-grad",
    ink: "text-meal-breakfast-ink",
    icon: <SunIcon />,
  },
  lunch: {
    descriptor: "Mais energia",
    image: "/refeicoes/almoco.jpg",
    surface: "bg-meal-lunch",
    gradient: "bg-meal-lunch-grad",
    ink: "text-meal-lunch-ink",
    icon: <CutleryIcon />,
  },
  snack: {
    descriptor: "Mantenha o foco",
    image: "/refeicoes/lanche.jpg",
    surface: "bg-meal-snack",
    gradient: "bg-meal-snack-grad",
    ink: "text-meal-snack-ink",
    icon: <LeafIcon />,
  },
  dinner: {
    descriptor: "Equilíbrio à noite",
    image: "/refeicoes/jantar.jpg",
    surface: "bg-meal-dinner",
    gradient: "bg-meal-dinner-grad",
    ink: "text-meal-dinner-ink",
    icon: <PlateIcon />,
  },
  supper: {
    descriptor: "Uma escolha leve",
    image: "/refeicoes/ceia.jpg",
    surface: "bg-meal-supper",
    gradient: "bg-meal-supper-grad",
    ink: "text-meal-supper-ink",
    icon: <MoonIcon />,
  },
};
