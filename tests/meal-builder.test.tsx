import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  ADD_SECOND_CARBOHYDRATE_LABEL,
  MealBuilderScreen,
} from "../src/components/MealBuilder.tsx";
import { HomeScreen } from "../src/pages/HomePage.tsx";
import { PERSONS, personByKey } from "../src/catalog/persons.ts";
import type { Food, MealConfig, Person } from "../src/domain/types.ts";
import { CALCULATION_ERROR_MESSAGE, formatUnits } from "../src/format.ts";

const lunch: MealConfig = {
  key: "lunch",
  label: "Almoço",
  targetCalories: 550,
  carbohydrateShare: 0.4,
  proteinShare: 0.6,
  order: 2,
};

const felipe: Person = {
  key: "felipe",
  name: "Felipe",
  dailyCalories: 550,
  roundingIncrementGrams: 10,
  excludedTags: ["fruit"],
  meals: [lunch],
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
const egg = food({
  id: "ovo",
  name: "Ovo",
  category: "protein",
  caloriesPer100g: 125,
  preparation: "cozido, sem sal",
  unit: { singular: "ovo", plural: "ovos", gramsPerUnit: 50, stepUnits: 0.5 },
});

function markup(
  carbohydrateId: string | null,
  proteinId: string | null,
  carbohydrates = [rice],
  secondCarbohydrateId: string | null = null,
  person: Person = felipe,
  proteins = [chicken],
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MealBuilderScreen
        person={person}
        meal={person.meals[0] ?? lunch}
        carbohydrates={carbohydrates}
        proteins={proteins}
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

test("lista as cinco refeições do Felipe com metas fixas e sem acompanhamento", () => {
  const person = personByKey("felipe");
  assert.ok(person);
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <HomeScreen person={person} />
    </MemoryRouter>,
  );
  assert.match(html, /Cardápio de Felipe/);
  assert.match(html, /Escolha uma refeição para calcular as porções/);
  for (const label of ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /kcal/);
  assert.equal(html.match(/href="\/felipe\/refeicoes\//g)?.length, 5);
  for (const forbidden of ["Lançar", "Salvar", "Consumir", "Histórico", "Restante"]) {
    assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test("a home da Gabriela também não mostra calorias", () => {
  const person = personByKey("gabriela");
  assert.ok(person);
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <HomeScreen person={person} />
    </MemoryRouter>,
  );
  assert.match(html, /Cardápio de Ana Gabriela/);
  assert.doesNotMatch(html, /kcal/);
  assert.equal(html.match(/href="\/gabriela\/refeicoes\//g)?.length, 5);
});

test("não mostra resultado antes das duas escolhas e anuncia a espera", () => {
  const empty = markup(null, null);
  assert.match(empty, /Escolha um carboidrato e uma proteína/);
  assert.match(empty, /aria-live="polite"/);
  assert.doesNotMatch(empty, /dentro da margem/);
  assert.doesNotMatch(empty, /kcal/);
  const proteinOnly = markup(null, "frango");
  assert.match(proteinOnly, /Agora escolha o carboidrato/);
  const carbohydrateOnly = markup("arroz", null);
  assert.match(carbohydrateOnly, /Agora escolha a proteína/);
});

test("mostra porções em gramas, preparo, fonte e margem, mas nenhuma caloria", () => {
  const html = markup("arroz", "frango");
  assert.match(html, /170 g/);
  assert.match(html, /180 g/);
  assert.match(html, /Porções dentro da margem/);
  assert.doesNotMatch(html, /kcal/);
  assert.doesNotMatch(html, /Total estimado|Meta:/);
  assert.match(html, /cozido, sem óleo/);
  assert.match(html, /grelhado, sem óleo/);
  assert.match(html, /TBCA/);
  assert.match(html, /TESTE/);
  assert.doesNotMatch(html, /\d+\s*=\s*\d+/);
  assert.doesNotMatch(html, /<input(?![^>]*type="radio")/);
});

test("segundo carboidrato fica recolhido e divide a porção dos dois", () => {
  const alone = markup("arroz", "frango", [rice, beans]);
  assert.match(alone, new RegExp(ADD_SECOND_CARBOHYDRATE_LABEL));
  assert.doesNotMatch(alone, /Segundo carboidrato \(opcional\)/);
  assert.doesNotMatch(alone, /Sem segundo carboidrato/);
  assert.match(alone, /170 g/);
  assert.doesNotMatch(alone, /150 g/);

  const both = markup("arroz", "frango", [rice, beans], "feijao");
  assert.match(both, /Segundo carboidrato \(opcional\)/);
  assert.match(both, /Sem segundo carboidrato/);
  assert.doesNotMatch(both, new RegExp(ADD_SECOND_CARBOHYDRATE_LABEL));
  assert.match(both, /80 g/);
  assert.match(both, /150 g/);
  assert.match(both, /180 g/);
  assert.match(both, /Porções dentro da margem/);
  assert.doesNotMatch(both, /kcal/);
  assert.match(both, /cozido com caldo/);
  assert.doesNotMatch(both, /170 g/);
  assert.doesNotMatch(both, /<input(?![^>]*type="radio")/);
});

test("o mesmo alimento não aparece nos dois seletores de carboidrato", () => {
  const html = markup("arroz", "frango", [rice, beans], "feijao");
  assert.equal(html.match(/value="arroz"/g)?.length, 1);
  assert.equal(html.match(/value="feijao"/g)?.length, 2);
});

test("cada tile mostra nome e preparo, sem energia, com etapas visíveis", () => {
  const html = markup("arroz", null, [rice, beans]);
  assert.match(html, /Arroz branco/);
  assert.match(html, /cozido com caldo/);
  assert.doesNotMatch(html, /kcal|100 g/);
  assert.match(html, /aria-label="Etapas"/);
  assert.equal(html.match(/aria-current="step"/g)?.length, 1);
});

test("ovo aparece em quantidade de ovos, com as gramas como detalhe", () => {
  const html = markup("arroz", "ovo", [rice], null, felipe, [egg]);
  assert.match(html, /5 ovos e ½/);
  assert.match(html, /275 g/);
  assert.doesNotMatch(html, /kcal/);
  assert.match(html, /Porções dentro da margem/);
  assert.match(html, /160 g/);

  const semUnidade = markup("arroz", "frango");
  assert.doesNotMatch(semUnidade, /ovo/);
  assert.match(semUnidade, /180 g/);
});

test("contagem de unidades tem singular, plural e meia unidade", () => {
  const unit = { singular: "ovo", plural: "ovos", gramsPerUnit: 50, stepUnits: 0.5 };
  assert.equal(formatUnits(1, unit), "1 ovo");
  assert.equal(formatUnits(2, unit), "2 ovos");
  assert.equal(formatUnits(0.5, unit), "½ ovo");
  assert.equal(formatUnits(1.5, unit), "1 ovo e ½");
  assert.equal(formatUnits(3.5, unit), "3 ovos e ½");
  assert.equal(formatUnits(1.25, unit), "1,25 ovos");
  const bread = { singular: "pão", plural: "pães", gramsPerUnit: 50, stepUnits: 0.5 };
  assert.equal(formatUnits(1, bread), "1 pão");
  assert.equal(formatUnits(2, bread), "2 pães");
  assert.equal(formatUnits(0.5, bread), "½ pão");
});

test("arredondamento por pessoa: Gabriela usa 5 g na meta de 330", () => {
  const gabriela = PERSONS.find((person) => person.key === "gabriela");
  assert.ok(gabriela);
  const lunchOnly: Person = {
    ...gabriela,
    dailyCalories: 330,
    meals: gabriela.meals.filter((meal) => meal.key === "lunch"),
  };
  const html = markup("arroz", "frango", [rice], null, lunchOnly);
  assert.match(html, /Cardápio de Ana Gabriela/);
  assert.match(html, /100 g/);
  assert.match(html, /110 g/);
  assert.match(html, /Porções dentro da margem/);
  assert.doesNotMatch(html, /kcal/);
});

test("erro de cálculo não quebra a tela nem exibe NaN", () => {
  const html = markup("arroz", "frango", [
    { ...rice, caloriesPer100g: 0 },
  ]);
  assert.match(html, new RegExp(CALCULATION_ERROR_MESSAGE));
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.doesNotMatch(html, /dentro da margem/);
});
