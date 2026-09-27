import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustMealPercents,
  normalizeMealPercents,
} from "../src/domain/nutrition/adjust-meal-shares.ts";
import { MEAL_KEYS } from "../src/domain/nutrition/distribute-targets.ts";
import { FALLBACK_MEAL_SHARES } from "../src/domain/nutrition/policy.ts";
import type { MealKey } from "../src/domain/types.ts";

const PROFILE = {
  breakfast: 20,
  lunch: 27.5,
  snack: 15,
  dinner: 27.5,
  supper: 10,
} as const satisfies Record<MealKey, number>;

const NORMALIZED = {
  breakfast: 20,
  lunch: 28,
  snack: 15,
  dinner: 27,
  supper: 10,
} as const satisfies Record<MealKey, number>;

function assertClosed(shares: Record<MealKey, number>): void {
  let total = 0;
  for (const key of MEAL_KEYS) {
    assert.equal(Number.isInteger(shares[key]), true);
    assert.ok(shares[key] >= 5);
    total += shares[key];
  }
  assert.equal(total, 100);
}

test("normaliza 20 / 27,5 / 15 / 27,5 / 10 sem inverter quem é maior", () => {
  const normalized = normalizeMealPercents(PROFILE);
  assert.deepEqual(normalized, NORMALIZED);
  assert.deepEqual(normalizeMealPercents(normalized), NORMALIZED);
  assert.ok(normalized.lunch > normalized.dinner);
  assert.ok(normalized.dinner > normalized.breakfast);
  assert.ok(normalized.breakfast > normalized.snack);
  assert.ok(normalized.snack > normalized.supper);

  const fromPolicy = normalizeMealPercents({
    breakfast: FALLBACK_MEAL_SHARES.breakfast * 100,
    lunch: FALLBACK_MEAL_SHARES.lunch * 100,
    snack: FALLBACK_MEAL_SHARES.snack * 100,
    dinner: FALLBACK_MEAL_SHARES.dinner * 100,
    supper: FALLBACK_MEAL_SHARES.supper * 100,
  });
  assert.deepEqual(fromPolicy, NORMALIZED);
});

test("somar 1 tira o ponto da outra refeição com maior participação", () => {
  assert.deepEqual(adjustMealPercents(NORMALIZED, "lunch", 1), {
    breakfast: 20,
    lunch: 29,
    snack: 15,
    dinner: 26,
    supper: 10,
  });
});

test("subtrair 1 devolve o ponto à outra refeição com maior participação", () => {
  assert.deepEqual(adjustMealPercents(NORMALIZED, "lunch", -1), {
    breakfast: 20,
    lunch: 27,
    snack: 15,
    dinner: 28,
    supper: 10,
  });
});

test("o piso de 5% trava a redução e o aumento quando as outras já estão no piso", () => {
  const low = {
    breakfast: 5,
    lunch: 40,
    snack: 20,
    dinner: 25,
    supper: 10,
  };
  assert.deepEqual(adjustMealPercents(low, "breakfast", -1), low);

  const capped = {
    breakfast: 80,
    lunch: 5,
    snack: 5,
    dinner: 5,
    supper: 5,
  };
  assert.deepEqual(adjustMealPercents(capped, "breakfast", 1), capped);
  assert.deepEqual(adjustMealPercents(capped, "breakfast", -1), {
    breakfast: 79,
    lunch: 6,
    snack: 5,
    dinner: 5,
    supper: 5,
  });
});

test("o resto do arredondamento é estável e o empate segue a ordem das refeições", () => {
  const tied = {
    breakfast: 20,
    lunch: 30,
    snack: 10,
    dinner: 30,
    supper: 10,
  };
  const expected = {
    breakfast: 23,
    lunch: 28,
    snack: 10,
    dinner: 29,
    supper: 10,
  };
  assert.deepEqual(adjustMealPercents(tied, "breakfast", 3), expected);
  assert.deepEqual(adjustMealPercents(tied, "breakfast", 3), expected);

  assert.deepEqual(
    adjustMealPercents(
      { breakfast: 30, lunch: 25, snack: 20, dinner: 15, supper: 10 },
      "breakfast",
      6,
    ),
    { breakfast: 36, lunch: 21, snack: 19, dinner: 14, supper: 10 },
  );
  assert.deepEqual(
    adjustMealPercents(
      { breakfast: 30, lunch: 25, snack: 20, dinner: 15, supper: 10 },
      "breakfast",
      -6,
    ),
    { breakfast: 24, lunch: 29, snack: 21, dinner: 16, supper: 10 },
  );
});

test("os cinco inteiros somam 100 em toda sequência", () => {
  let shares: Record<MealKey, number> = normalizeMealPercents(PROFILE);
  const moves: readonly (readonly [MealKey, 1 | -1])[] = [
    ["breakfast", 1],
    ["breakfast", 1],
    ["supper", -1],
    ["lunch", 1],
    ["dinner", -1],
    ["snack", 1],
    ["snack", -1],
    ["supper", 1],
    ["breakfast", -1],
    ["lunch", -1],
    ["dinner", 1],
    ["supper", -1],
  ];
  assertClosed(shares);
  for (const [key, delta] of moves) {
    shares = adjustMealPercents(shares, key, delta);
    assertClosed(shares);
  }
});
