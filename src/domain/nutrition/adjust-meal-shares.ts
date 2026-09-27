import type { MealKey } from "../types.ts";
import { MEAL_KEYS } from "./distribute-targets.ts";
import { FALLBACK_MEAL_SHARES } from "./policy.ts";

/** Sempre há 100 pontos para distribuir entre as cinco refeições. */
export const MEAL_PERCENT_TOTAL = 100;

/** Uma refeição não desce disso, para não sumir da distribuição. */
export const MEAL_PERCENT_FLOOR = 5;

const COMPARE_EPSILON = 1e-6;

function fallbackPercents(): Record<MealKey, number> {
  return {
    breakfast: FALLBACK_MEAL_SHARES.breakfast * 100,
    lunch: FALLBACK_MEAL_SHARES.lunch * 100,
    snack: FALLBACK_MEAL_SHARES.snack * 100,
    dinner: FALLBACK_MEAL_SHARES.dinner * 100,
    supper: FALLBACK_MEAL_SHARES.supper * 100,
  };
}

function blankShares(): Record<MealKey, number> {
  return {
    breakfast: 0,
    lunch: 0,
    snack: 0,
    dinner: 0,
    supper: 0,
  };
}

function copyShares(
  shares: Readonly<Record<MealKey, number>>,
): Record<MealKey, number> {
  return {
    breakfast: shares.breakfast,
    lunch: shares.lunch,
    snack: shares.snack,
    dinner: shares.dinner,
    supper: shares.supper,
  };
}

function sumShares(shares: Readonly<Record<MealKey, number>>): number {
  let total = 0;
  for (const key of MEAL_KEYS) total += shares[key];
  return total;
}

function usable(shares: Readonly<Record<MealKey, number>>): boolean {
  return MEAL_KEYS.every((key) => Number.isFinite(shares[key]) && shares[key] > 0);
}

function quantize(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function roomAboveFloor(share: number): number {
  return Math.max(0, share - MEAL_PERCENT_FLOOR);
}

/**
 * Maior participação entre as refeições indicadas.
 * Empate fica com quem vem antes: café, almoço, lanche, jantar, ceia.
 */
function largestShare(
  shares: Readonly<Record<MealKey, number>>,
  keys: readonly MealKey[],
): MealKey | null {
  let winner: MealKey | null = null;
  for (const key of MEAL_KEYS) {
    if (!keys.includes(key)) continue;
    if (winner === null || shares[key] > shares[winner] + COMPARE_EPSILON) {
      winner = key;
    }
  }
  return winner;
}

/**
 * Reparte pontos inteiros na proporção da folga acima do piso.
 * O que sobra do arredondamento vai todo para a maior participação.
 * Com limite, ninguém entrega mais pontos do que a própria folga.
 */
function allocateByRoom(
  shares: Readonly<Record<MealKey, number>>,
  keys: readonly MealKey[],
  points: number,
  limitToRoom: boolean,
): Record<MealKey, number> {
  const amounts = blankShares();
  if (points <= 0 || keys.length === 0) return amounts;

  const rooms = blankShares();
  let totalRoom = 0;
  for (const key of keys) {
    const room = roomAboveFloor(shares[key]);
    rooms[key] = room;
    totalRoom += room;
  }

  let leftover = points;
  if (totalRoom > 0) {
    for (const key of keys) {
      let portion = Math.floor((points * rooms[key]) / totalRoom);
      if (limitToRoom) portion = Math.min(portion, rooms[key]);
      amounts[key] = portion;
      leftover -= portion;
    }
  }

  while (leftover > 0) {
    const eligible = keys.filter((key) => !limitToRoom || rooms[key] - amounts[key] > 0);
    const winner = largestShare(shares, eligible);
    if (winner === null) break;
    if (!limitToRoom) {
      amounts[winner] += leftover;
      break;
    }
    const space = rooms[winner] - amounts[winner];
    const chunk = Math.min(leftover, space);
    if (chunk <= 0) break;
    amounts[winner] += chunk;
    leftover -= chunk;
  }

  return amounts;
}

function applyAmounts(
  shares: Record<MealKey, number>,
  amounts: Readonly<Record<MealKey, number>>,
  sign: 1 | -1,
): void {
  for (const key of MEAL_KEYS) shares[key] += sign * amounts[key];
}

function liftToFloor(shares: Record<MealKey, number>): Record<MealKey, number> {
  const next = copyShares(shares);
  let deficit = 0;
  for (const key of MEAL_KEYS) {
    if (next[key] < MEAL_PERCENT_FLOOR) {
      deficit += MEAL_PERCENT_FLOOR - next[key];
      next[key] = MEAL_PERCENT_FLOOR;
    }
  }
  if (deficit === 0) return next;
  const donors = MEAL_KEYS.filter((key) => next[key] > MEAL_PERCENT_FLOOR);
  const taken = allocateByRoom(next, donors, deficit, true);
  applyAmounts(next, taken, -1);
  return next;
}

/**
 * Converte os percentuais do formulário em inteiros que somam 100.
 * O piso de cada parte inteira preserva quem era maior; o resto cai na maior participação.
 */
export function normalizeMealPercents(
  percents: Readonly<Record<MealKey, number>>,
): Record<MealKey, number> {
  const source = usable(percents) ? percents : fallbackPercents();
  const total = sumShares(source);
  const scaled = blankShares();
  for (const key of MEAL_KEYS) {
    scaled[key] = quantize((source[key] * MEAL_PERCENT_TOTAL) / total);
  }

  const next = blankShares();
  for (const key of MEAL_KEYS) {
    next[key] = Math.floor(scaled[key] + COMPARE_EPSILON);
  }

  const remainder = MEAL_PERCENT_TOTAL - sumShares(next);
  if (remainder > 0) {
    const winner = largestShare(scaled, MEAL_KEYS);
    if (winner) next[winner] += remainder;
  } else if (remainder < 0) {
    let extra = -remainder;
    while (extra > 0) {
      const donor = largestShare(
        next,
        MEAL_KEYS.filter((key) => next[key] > MEAL_PERCENT_FLOOR),
      );
      if (donor === null) break;
      next[donor] -= 1;
      extra -= 1;
    }
  }

  return liftToFloor(next);
}

export function canDecreaseMealPercent(
  percents: Readonly<Record<MealKey, number>>,
  mealKey: MealKey,
): boolean {
  return percents[mealKey] > MEAL_PERCENT_FLOOR;
}

export function canIncreaseMealPercent(
  percents: Readonly<Record<MealKey, number>>,
  mealKey: MealKey,
): boolean {
  return MEAL_KEYS.some((key) => key !== mealKey && percents[key] > MEAL_PERCENT_FLOOR);
}

/**
 * Soma ou tira pontos de uma refeição e reparte o inverso nas outras.
 * Depois do ajuste os cinco inteiros somam exatamente 100.
 */
export function adjustMealPercents(
  percents: Readonly<Record<MealKey, number>>,
  mealKey: MealKey,
  delta: number,
): Record<MealKey, number> {
  const current = normalizeMealPercents(percents);
  if (!Number.isInteger(delta) || delta === 0) return current;

  const others = MEAL_KEYS.filter((key) => key !== mealKey);
  if (delta > 0) {
    const available = others.reduce((sum, key) => sum + roomAboveFloor(current[key]), 0);
    const points = Math.min(delta, available);
    if (points <= 0) return current;
    const taken = allocateByRoom(current, others, points, true);
    applyAmounts(current, taken, -1);
    current[mealKey] += sumShares(taken);
    return current;
  }

  const points = Math.min(-delta, roomAboveFloor(current[mealKey]));
  if (points <= 0) return current;
  const given = allocateByRoom(current, others, points, false);
  applyAmounts(current, given, 1);
  current[mealKey] -= sumShares(given);
  return current;
}
