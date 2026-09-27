import type { PortionSolutionState } from "../domain/types.ts";

export const SOLUTION_STATE_LABEL: Record<PortionSolutionState, string> = {
  within_targets: "Combinação dentro das metas calculadas",
  approximate: "Esta combinação precisa de ajuste",
  search_incomplete: "Foi encontrada uma aproximação; o ajuste não foi concluído",
  missing_nutrition: "Falta informação nutricional para otimizar esta combinação.",
  invalid_selection: "A seleção não é válida para esta refeição.",
  no_valid_portions: "Não há porções válidas dentro dos limites desta combinação.",
  energy_budget_exhausted: "Não há saldo energético positivo para calcular porções.",
};

export function solutionStateLabel(state: PortionSolutionState): string {
  return SOLUTION_STATE_LABEL[state];
}

export const EXPERIMENTAL_DISCLAIMER =
  "Estimativa automática para uso experimental. Não é uma prescrição alimentar nem uma avaliação clínica.";

export const ESTIMATE_NOT_COMPLETED =
  "A estimativa não foi concluída. O plano anterior permanece.";

export const REDISTRIBUTION_HELP =
  "Uma refeição com qualquer lançamento fica fora da redistribuição até o último registro ser removido.";

export const MANUAL_LOG_STILL_AVAILABLE =
  "O registro manual continua disponível no diário.";

export const PARTIAL_TOTAL_LABEL = "total parcial";

export const DAY_ENERGY_NOTICE_CODES = ["day_target_met", "day_target_exceeded"] as const;
