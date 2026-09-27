import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Fontes externas dependem da rede do ambiente, não do app.
    if (/^https:\/\/fonts\./.test(message.location().url)) return;
    errors.push(message.text());
  });
  return errors;
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("consulta porções do almoço do Felipe e recalcula ao trocar o alimento", async ({
  page,
}) => {
  const consoleErrors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/felipe$/);
  await expect(
    page.getByRole("heading", { name: "Cardápio de Felipe" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pessoa" })).toHaveValue(
    "felipe",
  );
  const meals = page.getByRole("list").getByRole("link");
  await expect(meals).toHaveText([
    /Café da manhã\s+Comece o dia$/,
    /Almoço\s+Mais energia$/,
    /Lanche\s+Mantenha o foco$/,
    /Jantar\s+Equilíbrio à noite$/,
    /Ceia\s+Uma escolha leve$/,
  ]);
  const body = await page.locator("body").innerText();
  for (const forbidden of ["Lançar", "Salvar", "Consumir", "Histórico", "Restante", "kcal"]) {
    expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }
  await expectNoOverflow(page);

  await page.getByRole("link", { name: /Almoço/ }).click();
  await expect(page).toHaveURL(/\/felipe\/refeicoes\/lunch$/);
  await expect(page.getByRole("heading", { name: "Almoço" })).toBeVisible();
  await expect(page.getByText("Cardápio de Felipe")).toBeVisible();
  await expect(page.locator('input:not([type="checkbox"])')).toHaveCount(0);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);

  const carbohydrates = page.getByRole("group", {
    name: "Carboidrato",
    exact: true,
  });
  const proteins = page.getByRole("group", { name: "Proteína" });
  await expect(carbohydrates.getByRole("checkbox")).toHaveCount(8);
  await expect(proteins.getByRole("checkbox")).toHaveCount(7);
  await expect(
    carbohydrates.getByRole("checkbox", { name: /Feijão carioca/ }),
  ).toHaveCount(1);
  await expect(
    carbohydrates.getByRole("checkbox", { name: /Peito de frango/ }),
  ).toHaveCount(0);
  await expect(
    proteins.getByRole("checkbox", { name: /Arroz branco/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar segundo carboidrato" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Segundo carboidrato (opcional)" }),
  ).toHaveCount(0);
  await expect(page.getByText("Escolha um carboidrato e uma proteína.")).toBeVisible();
  await expect(page.getByText("dentro da margem")).toHaveCount(0);
  await expect(page.getByText("cozido, sem óleo, sem sal").first()).toBeVisible();

  await carbohydrates.getByRole("checkbox", { name: /Arroz branco/ }).click();
  await expect(
    carbohydrates.getByRole("checkbox", { name: /Arroz branco/ }),
  ).toBeChecked();
  await expect(page).toHaveURL(/carb=arroz-branco/);
  await expect(page.getByText("Agora escolha a proteína.")).toBeVisible();
  await proteins.getByRole("checkbox", { name: /Peito de frango/ }).click();
  await expect(page).toHaveURL(/protein=peito-de-frango/);

  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");
  await expect(live).toContainText("220 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("kcal");
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("kcal");
  await expect(live).toContainText("cozido, sem óleo, sem sal");
  await expect(live).toContainText("grelhado, sem pele, sem óleo, sem sal");
  await expect(live).toContainText("TBCA");
  await expect(live).toContainText("BRC0018A");
  await expect(live).not.toContainText("NaN");
  await expect(
    page.getByText("Não foi possível calcular esta combinação."),
  ).toHaveCount(0);
  await expect(page.locator("[aria-current='step']")).toHaveText(/Porção/);

  await carbohydrates.getByRole("checkbox", { name: /Arroz branco/ }).click();
  await carbohydrates.getByRole("checkbox", { name: /Feijão carioca/ }).click();
  await expect(page).toHaveURL(/carb=feijao-carioca/);
  await expect(page).not.toHaveURL(/carb2=/);
  await expect(live).toContainText("310 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("170 g");
  await expectNoOverflow(page);

  await page.getByRole("link", { name: "Escolher outra refeição" }).click();
  await expect(page).toHaveURL(/\/felipe$/);
  await page.getByRole("link", { name: /Jantar/ }).click();
  await expect(page.getByRole("heading", { name: "Jantar" })).toBeVisible();
  await expect(page.getByText("Escolha um carboidrato e uma proteína.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("arroz com feijão abre o segundo carboidrato e divide a porção", async ({
  page,
}) => {
  const consoleErrors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/felipe/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");

  await expect(
    page.getByRole("button", { name: "Adicionar segundo carboidrato" }),
  ).toHaveCount(0);
  const carbohydrates = page.getByRole("group", {
    name: "Carboidrato",
    exact: true,
  });
  await expect(
    carbohydrates.getByRole("checkbox", { name: /Arroz branco/ }),
  ).toBeChecked();

  const beans = carbohydrates.getByRole("checkbox", {
    name: /Feijão carioca/,
  });
  await beans.click();
  await expect(beans).toBeChecked();
  await expect(
    carbohydrates.getByRole("checkbox", { name: /Arroz branco/ }),
  ).toBeChecked();
  await expect(page).toHaveURL(/carb2=feijao-carioca/);
  await expect(live).toContainText("80 g");
  await expect(live).toContainText("150 g");
  await expect(live).toContainText("220 g");
  await expect(live).not.toContainText("kcal");
  await expect(live).toContainText("cozido com caldo, sem óleo, sem sal");
  await expect(live).toContainText("BRC0001T");
  await expect(live).not.toContainText("170 g");
  await expect(live).not.toContainText("NaN");
  await expectNoOverflow(page);

  await beans.click();
  await expect(page).not.toHaveURL(/carb2=/);
  await expect(beans).not.toBeChecked();
  await expect(live).toContainText("170 g");
  await expect(live).not.toContainText("150 g");
  expect(consoleErrors).toEqual([]);
});

test("o dropdown troca de pessoa mantendo a refeição e libera fruta só para a Gabriela", async ({
  page,
}) => {
  const consoleErrors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/felipe/refeicoes/breakfast");
  const carbohydrates = page.getByRole("group", {
    name: "Carboidrato",
    exact: true,
  });
  const proteins = page.getByRole("group", { name: "Proteína" });
  await expect(page.getByText("Cardápio de Felipe")).toBeVisible();
  await expect(carbohydrates.getByRole("checkbox")).toHaveCount(3);
  await expect(carbohydrates.getByRole("checkbox", { name: /Banana/ })).toHaveCount(0);
  await expect(carbohydrates.getByRole("checkbox", { name: /Mamão/ })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Pessoa" }).selectOption("gabriela");
  await expect(page).toHaveURL(/\/gabriela\/refeicoes\/breakfast$/);
  await expect(page.getByText("Cardápio de Ana Gabriela")).toBeVisible();
  await expect(carbohydrates.getByRole("checkbox")).toHaveCount(5);
  await expect(carbohydrates.getByRole("checkbox", { name: /Banana/ })).toHaveCount(1);

  await carbohydrates.getByRole("checkbox", { name: /Banana/ }).click();
  await proteins.getByRole("checkbox", { name: /Iogurte natural/ }).click();
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("90 g");
  await expect(live).toContainText("255 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("kcal");
  await expectNoOverflow(page);

  await page.getByRole("combobox", { name: "Pessoa" }).selectOption("felipe");
  await expect(page).toHaveURL(
    /\/felipe\/refeicoes\/breakfast\?carb=banana&protein=iogurte-natural$/,
  );
  await expect(page.getByText("Cardápio de Felipe")).toBeVisible();
  await expect(carbohydrates.getByRole("checkbox", { name: /Banana/ })).toHaveCount(0);
  await expect(
    proteins.getByRole("checkbox", { name: /Iogurte natural/ }),
  ).toBeChecked();
  await expect(page.getByText("Agora escolha o carboidrato.")).toBeVisible();
  await expect(live).not.toContainText("dentro da margem");

  await page.getByRole("link", { name: "Guia de refeições" }).click();
  await expect(page).toHaveURL(/\/felipe$/);
  await expect(
    page.getByRole("heading", { name: "Cardápio de Felipe" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Pessoa" }).selectOption("gabriela");
  await expect(page).toHaveURL(/\/gabriela$/);
  await expect(
    page.getByRole("heading", { name: "Cardápio de Ana Gabriela" }),
  ).toBeVisible();
  await expect(page.getByRole("list").getByRole("link")).toHaveCount(5);
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("kcal");
  expect(consoleErrors).toEqual([]);
});

test("a ceia tem carboidrato sem fruta para o Felipe e usa 5 g para a Gabriela", async ({
  page,
}) => {
  await page.goto("/felipe/refeicoes/supper");
  const carbohydrates = page.getByRole("group", {
    name: "Carboidrato",
    exact: true,
  });
  await expect(carbohydrates.getByRole("checkbox")).toHaveCount(2);
  await expect(carbohydrates.getByRole("checkbox", { name: /Aveia/ })).toHaveCount(1);
  await expect(carbohydrates.getByRole("checkbox", { name: /Tapioca/ })).toHaveCount(1);
  await expect(carbohydrates.getByRole("checkbox", { name: /Banana/ })).toHaveCount(0);
  await carbohydrates.getByRole("checkbox", { name: /Aveia/ }).click();
  await page.getByRole("group", { name: "Proteína" })
    .getByRole("checkbox", { name: /Iogurte natural/ })
    .click();
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("20 g");
  await expect(live).toContainText("210 g");
  await expect(live).not.toContainText("kcal");

  await page.goto(
    "/gabriela/refeicoes/supper?carb=banana&protein=iogurte-natural",
  );
  await expect(page.getByText("Cardápio de Ana Gabriela")).toBeVisible();
  await expect(live).toContainText("45 g");
  await expect(live).toContainText("125 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("kcal");
});

test("URLs antigas e pessoas desconhecidas caem na pessoa padrão", async ({
  page,
}) => {
  await page.goto("/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  await expect(page).toHaveURL(
    /\/felipe\/refeicoes\/lunch\?carb=arroz-branco&protein=peito-de-frango$/,
  );
  await expect(page.locator("[aria-live='polite']")).toContainText("220 g");
  await page.goto(
    "/gabriela/refeicoes/dinner?carb=arroz-branco&carb2=feijao-preto&protein=peito-de-frango",
  );
  await expect(page.getByRole("heading", { name: "Jantar" })).toBeVisible();
  await expect(page.locator("[aria-live='polite']")).toContainText("50 g");
  await expect(page.locator("[aria-live='polite']")).toContainText("Feijão preto");
  await page.goto(
    "/felipe/refeicoes/lunch?carb=arroz-branco&carb2=arroz-branco&protein=peito-de-frango",
  );
  await expect(page.locator("[aria-live='polite']")).toContainText("170 g");
  await page.goto("/felipe");
  const people = page.getByRole("combobox", { name: "Pessoa" });
  await expect(people.getByRole("option")).toHaveText(["Felipe", "Ana Gabriela", "Kelly"]);
  await people.selectOption("kelly");
  await expect(page).toHaveURL(/\/kelly$/);
  await expect(page.getByRole("heading", { name: "Cardápio de Kelly" })).toBeVisible();
  await page.goto("/kelly/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  const kellyLive = page.locator("[aria-live='polite']");
  await expect(kellyLive).toContainText("110 g");
  await expect(kellyLive).toContainText("140 g");
  await expect(kellyLive).toContainText("Porções dentro da margem");
  await expect(kellyLive).not.toContainText("kcal");
  await page.goto("/ninguem/refeicoes/lunch");
  await expect(page).toHaveURL(/\/felipe$/);
  await page.goto("/felipe/refeicoes/brunch");
  await expect(
    page.getByRole("heading", { name: "Refeição não encontrada" }),
  ).toBeVisible();
});

test("o ovo e o pão vêm em unidades, com as gramas como detalhe", async ({
  page,
}) => {
  const consoleErrors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/felipe/refeicoes/breakfast?carb=pao-frances&protein=ovo");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("4 ovos");
  await expect(live).toContainText("200 g");
  await expect(live).toContainText("1 pão");
  await expect(live).toContainText("50 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("kcal");
  await expectNoOverflow(page);

  await page.goto("/kelly/refeicoes/snack?carb=aveia&protein=ovo");
  await expect(live).toContainText("2 ovos");
  await expect(live).toContainText("100 g");

  const proteins = page.getByRole("group", { name: "Proteína" });
  await proteins.getByRole("checkbox", { name: /Ovo/ }).click();
  await proteins.getByRole("checkbox", { name: /Iogurte natural/ }).click();
  await expect(live).not.toContainText("ovo");
  await expect(live).toContainText("g");
  await expectNoOverflow(page);
  expect(consoleErrors).toEqual([]);
});
