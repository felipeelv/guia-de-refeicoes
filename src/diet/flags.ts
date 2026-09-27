/**
 * Interruptores internos do MVP. Desligar um deles não apaga o envelope v2
 * nem o leitor em DietContext.
 *
 * questionnaire: esconde o questionário e o recálculo.
 * macroSolver: o montador volta ao cálculo calórico, mesmo com plano confirmado.
 * diaryV2: o diário volta à tela calórica v1; a leitura do envelope continua.
 */
export const dietFlags = {
  questionnaire: true,
  macroSolver: true,
  diaryV2: true,
} as const;
