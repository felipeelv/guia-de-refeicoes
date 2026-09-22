import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { MealBuilderScreen } from "../src/components/MealBuilder.tsx";
import { HomePage } from "../src/pages/HomePage.tsx";
import type { Food, MealConfig } from "../src/domain/types.ts";
import { CALCULATION_ERROR_MESSAGE } from "../src/format.ts";

const lunch: MealConfig = {
  key: "lunch",
  label: "Almoço",
  targetCalories: 550,
  carbohydrateShare: 0.4,
  proteinShare: 0.6,
  order: 2,
};

function food(
  overrides: Partial<Food> & Pick<Food, "id" | "category" | "name">,
): Food {
  return {
    meals: ["lunch"],
    preparation: "cozido, sem óleo",
    caloriesPer100g: 130,
    proteinPer100g: 2,
    carbohydratePer100g: 28,
    fatPer100g: 0.4,
    source: {
      name: "TBCA",
      code: "TESTE",
      url: "https://www.tbca.net.br/",
      accessedAt: "2026-09-22",
    },
    active: true,
    sortOrder: 1,
    ...overrides,
  };
}

const rice = food({
  id: "arroz",
  name: "Arroz branco",
  category: "carbohydrate",
  caloriesPer100g: 130,
});
const beans = food({
  id: "feijao",
  name: "Feijão carioca",
  category: "carbohydrate",
  caloriesPer100g: 71,
  preparation: "cozido com caldo",
  sortOrder: 2,
});
const chicken = food({
  id: "frango",
  name: "Peito de frango",
  category: "protein",
  caloriesPer100g: 180,
  preparation: "grelhado, sem óleo",
});

function markup(
  carbohydrateId: string | null,
  proteinId: string | null,
  carbohydrates = [rice],
  secondCarbohydrateId: string | null = null,
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MealBuilderScreen
        meal={lunch}
        carbohydrates={carbohydrates}
        proteins={[chicken]}
        carbohydrateId={carbohydrateId}
        secondCarbohydrateId={secondCarbohydrateId}
        proteinId={proteinId}
        onCarbohydrateChange={() => undefined}
        onSecondCarbohydrateChange={() => undefined}
        onProteinChange={() => undefined}
      />
    </MemoryRouter>,
  );
}

test("lista as cinco refeições com metas fixas e sem acompanhamento", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
  assert.match(html, /Guia de refeições/);
  assert.match(html, /Escolha uma refeição para calcular as porções/);
  for (const snippet of ["400 kcal", "550 kcal", "300 kcal", "200 kcal"]) {
    assert.match(html, new RegExp(snippet));
  }
  assert.equal(html.match(/550 kcal/g)?.length, 2);
  for (const forbidden of ["Lançar", "Salvar", "Consumir", "Histórico", "Restante"]) {
    assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test("não mostra resultado antes das duas escolhas e anuncia a espera", () => {
  const empty = markup(null, null);
  assert.match(empty, /Escolha um carboidrato e uma proteína/);
  assert.match(empty, /aria-live="polite"/);
  assert.doesNotMatch(empty, /Total estimado/);
  const proteinOnly = markup(null, "frango");
  assert.match(proteinOnly, /Agora escolha o carboidrato/);
  const carbohydrateOnly = markup("arroz", null);
  assert.match(carbohydrateOnly, /Agora escolha a proteína/);
});

test("mostra porções, preparo, fonte e diferença sem igualar o total à meta", () => {
  const html = markup("arroz", "frango");
  assert.match(html, /170 g/);
  assert.match(html, /221 kcal/);
  assert.match(html, /180 g/);
  assert.match(html, /324 kcal/);
  assert.match(html, /Total estimado/);
  assert.match(html, /545 kcal/);
  assert.match(html, /5 kcal abaixo da meta · dentro da margem/);
  assert.match(html, /cozido, sem óleo/);
  assert.match(html, /grelhado, sem óleo/);
  assert.match(html, /TBCA/);
  assert.match(html, /TESTE/);
  assert.doesNotMatch(html, /\d+\s*=\s*\d+/);
  assert.doesNotMatch(html, /<input(?![^>]*type="radio")/);
});

test("segundo carboidrato é opcional e divide a porção dos dois", () => {
  const alone = markup("arroz", "frango", [rice, beans]);
  assert.match(alone, /Segundo carboidrato \(opcional\)/);
  assert.match(alone, /Sem segundo carboidrato/);
  assert.match(alone, /170 g/);
  assert.doesNotMatch(alone, /150 g/);

  const both = markup("arroz", "frango", [rice, beans], "feijao");
  assert.match(both, /80 g/);
  assert.match(both, /104 kcal/);
  assert.match(both, /150 g/);
  assert.match(both, /107 kcal/);
  assert.match(both, /180 g/);
  assert.match(both, /Total estimado/);
  assert.match(both, /535 kcal/);
  assert.match(both, /15 kcal abaixo da meta · dentro da margem/);
  assert.match(both, /cozido com caldo/);
  assert.doesNotMatch(both, /170 g/);
  assert.doesNotMatch(both, /<input(?![^>]*type="radio")/);
});

test("o mesmo alimento não aparece nos dois seletores de carboidrato", () => {
  const html = markup("arroz", "frango", [rice, beans]);
  assert.equal(html.match(/value="arroz"/g)?.length, 1);
  assert.equal(html.match(/value="feijao"/g)?.length, 2);
});

test("erro de cálculo não quebra a tela nem exibe NaN", () => {
  const html = markup("arroz", "frango", [
    { ...rice, caloriesPer100g: 0 },
  ]);
  assert.match(html, new RegExp(CALCULATION_ERROR_MESSAGE));
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.doesNotMatch(html, /Total estimado/);
});
