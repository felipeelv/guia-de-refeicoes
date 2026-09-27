import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { foods } from "../src/catalog/catalog.ts";
import {
  catalogWithSaved,
  libraryFoods,
  searchLibrary,
} from "../src/catalog/library.ts";
import { personByKey } from "../src/catalog/persons.ts";
import { TabBar } from "../src/components/PersonBar.tsx";
import { isMacroOptimizationEnabled } from "../src/catalog/catalog.ts";
import { foodsEnteringMenu } from "../src/diet/meal-selection.ts";
import {
  emptyProfile,
  loadProfile,
  saveProfile,
  type ProfileStorage,
} from "../src/diet/profile-store.ts";
import { AlimentosScreen } from "../src/pages/AlimentosPage.tsx";

class MemoryStorage implements ProfileStorage {
  private readonly values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  keys(): Iterable<string> {
    return this.values.keys();
  }
}

test("a biblioteca extra tem ficha TBCA e não repete os 26 alimentos", () => {
  assert.equal(libraryFoods.length, 14);
  const baseIds = new Set(foods.map((food) => food.id));
  const codes = new Set<string>();
  for (const food of libraryFoods) {
    assert.equal(baseIds.has(food.id), false, food.id);
    assert.equal(food.source.name, "TBCA");
    assert.equal(codes.has(food.source.code), false);
    codes.add(food.source.code);
    assert.equal(food.fatPer100g === null, false);
    assert.equal(isMacroOptimizationEnabled(food), true);
  }
  const apple = foods.find((food) => food.id === "maca");
  assert.ok(apple);
  assert.equal(apple.fatPer100g, null);
  assert.equal(isMacroOptimizationEnabled(apple), false);
});

test("a busca encontra um item da biblioteca pelo nome", () => {
  const found = searchLibrary("atum");
  assert.deepEqual(
    found.map((food) => food.id),
    ["atum"],
  );
  assert.equal(searchLibrary("").length, 0);
  assert.equal(searchLibrary("arroz").length, 0);
  assert.deepEqual(
    searchLibrary("Pao").map((food) => food.name),
    ["Pão integral"],
  );
});

test("alimento salvo para uma pessoa não aparece para outra", () => {
  const storage = new MemoryStorage();
  const felipeSaved = saveProfile(storage, {
    ...emptyProfile("felipe"),
    savedFoodIds: ["atum"],
  });
  const gabrielaSaved = saveProfile(storage, emptyProfile("gabriela"));
  assert.equal(felipeSaved.persisted, true);
  assert.equal(gabrielaSaved.persisted, true);
  const felipe = loadProfile(storage, "felipe");
  const gabriela = loadProfile(storage, "gabriela");
  assert.equal(felipe.ok && gabriela.ok, true);
  if (!felipe.ok || !gabriela.ok) return;
  assert.deepEqual(felipe.profile.savedFoodIds, ["atum"]);
  assert.deepEqual(gabriela.profile.savedFoodIds, []);

  const felipePerson = personByKey("felipe");
  const gabrielaPerson = personByKey("gabriela");
  assert.ok(felipePerson && gabrielaPerson);
  const felipeFoods = catalogWithSaved(foods, felipe.profile.savedFoodIds);
  const gabrielaFoods = catalogWithSaved(foods, gabriela.profile.savedFoodIds);
  assert.equal(felipeFoods.some((food) => food.id === "atum"), true);
  assert.equal(gabrielaFoods.some((food) => food.id === "atum"), false);

  const felipeMenu = foodsEnteringMenu({
    person: felipePerson,
    foods: felipeFoods,
    personalized: false,
    assessment: null,
  });
  const gabrielaMenu = foodsEnteringMenu({
    person: gabrielaPerson,
    foods: gabrielaFoods,
    personalized: false,
    assessment: null,
  });
  assert.equal(felipeMenu.some((food) => food.id === "atum"), true);
  assert.equal(gabrielaMenu.some((food) => food.id === "atum"), false);
});

test("fruta salva continua fora de quem exclui a tag", () => {
  const felipe = personByKey("felipe");
  const gabriela = personByKey("gabriela");
  assert.ok(felipe && gabriela);
  const combined = catalogWithSaved(foods, ["laranja"]);
  const hidden = foodsEnteringMenu({
    person: felipe,
    foods: combined,
    personalized: false,
    assessment: null,
  });
  const visible = foodsEnteringMenu({
    person: gabriela,
    foods: combined,
    personalized: false,
    assessment: null,
  });
  assert.equal(hidden.some((food) => food.id === "laranja"), false);
  assert.equal(visible.some((food) => food.id === "laranja"), true);
});

test("a busca da página mostra o alimento da biblioteca e a aba não ativa o cardápio", () => {
  const atum = libraryFoods.find((food) => food.id === "atum");
  assert.ok(atum);
  const html = renderToStaticMarkup(
    <AlimentosScreen
      personName="Felipe"
      menu={[atum]}
      savedIds={[]}
      query="atum"
      results={[atum]}
      allowedIds={new Set([atum.id])}
      onQuery={() => undefined}
      onSave={() => undefined}
      onRemove={() => undefined}
    />,
  );
  assert.match(html, /Buscar alimento/);
  assert.match(html, /Atum/);
  assert.match(html, /Salvar Atum/);

  const felipe = personByKey("felipe");
  assert.ok(felipe);
  const tabs = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/felipe/alimentos"]}>
      <TabBar person={felipe} />
    </MemoryRouter>,
  );
  assert.match(tabs, /Alimentos/);
  assert.match(tabs, /href="\/felipe\/alimentos"/);
  assert.equal(tabs.includes('href="/felipe"') && tabs.includes("aria-current"), true);
  const cardapioActive = /<a[^>]*href="\/felipe"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/felipe"/.test(
    tabs,
  );
  const foodsActive = /<a[^>]*href="\/felipe\/alimentos"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/felipe\/alimentos"/.test(
    tabs,
  );
  assert.equal(cardapioActive, false);
  assert.equal(foodsActive, true);
});

test("envelope antigo sem savedFoodIds abre com lista vazia", () => {
  const storage = new MemoryStorage();
  const legacy = emptyProfile("kelly") as unknown as Record<string, unknown>;
  delete legacy.savedFoodIds;
  storage.set("meal-guide:v2:profile:kelly", JSON.stringify(legacy));
  const loaded = loadProfile(storage, "kelly");
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.profile.savedFoodIds, []);
});
