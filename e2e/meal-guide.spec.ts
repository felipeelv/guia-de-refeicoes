import { expect, test } from "@playwright/test";

test("consulta porções do almoço e recalcula ao trocar o alimento", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Guia de refeições" }),
  ).toBeVisible();
  const meals = page.getByRole("list").getByRole("link");
  await expect(meals).toHaveText([
    /Café da manhã\s+Comece o dia\s+400 kcal/,
    /Almoço\s+Mais energia\s+550 kcal/,
    /Lanche\s+Mantenha o foco\s+300 kcal/,
    /Jantar\s+Equilíbrio à noite\s+550 kcal/,
    /Ceia\s+Uma escolha leve\s+200 kcal/,
  ]);
  const body = await page.locator("body").innerText();
  for (const forbidden of ["Lançar", "Salvar", "Consumir", "Histórico", "Restante"]) {
    expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Almoço" })).toBeVisible();
  await expect(page.getByText("550 kcal").first()).toBeVisible();
  await expect(page.locator('input:not([type="radio"])')).toHaveCount(0);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);

  const carbohydrates = page.getByRole("group", {
    name: "Carboidrato",
    exact: true,
  });
  const extraCarbohydrates = page.getByRole("group", {
    name: "Segundo carboidrato (opcional)",
  });
  const proteins = page.getByRole("group", { name: "Proteína" });
  await expect(carbohydrates.getByRole("radio")).toHaveCount(8);
  await expect(proteins.getByRole("radio")).toHaveCount(7);
  await expect(
    carbohydrates.getByRole("radio", { name: /Feijão carioca/ }),
  ).toHaveCount(1);
  await expect(
    carbohydrates.getByRole("radio", { name: /Peito de frango/ }),
  ).toHaveCount(0);
  await expect(
    proteins.getByRole("radio", { name: /Arroz branco/ }),
  ).toHaveCount(0);
  await expect(
    extraCarbohydrates.getByRole("radio", { name: "Sem segundo carboidrato" }),
  ).toBeChecked();
  await expect(page.getByText("Escolha um carboidrato e uma proteína.")).toBeVisible();
  await expect(page.getByText("Total estimado")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page.getByText("Agora escolha a proteína.")).toBeVisible();
  await expect(
    extraCarbohydrates.getByRole("radio", { name: /Arroz branco/ }),
  ).toHaveCount(0);
  await expect(extraCarbohydrates.getByRole("radio")).toHaveCount(8);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");

  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");
  await expect(live).toContainText("223 kcal");
  await expect(live).toContainText("220 g");
  await expect(live).toContainText("330 kcal");
  await expect(live).toContainText("Total estimado");
  await expect(live).toContainText("553 kcal");
  await expect(live).toContainText("3 kcal acima da meta · dentro da margem");
  await expect(live).toContainText("cozido, sem óleo, sem sal");
  await expect(live).toContainText("grelhado, sem pele, sem óleo, sem sal");
  await expect(live).toContainText("TBCA");
  await expect(live).toContainText("BRC0018A");
  await expect(live).not.toContainText("NaN");
  await expect(
    page.getByText("Não foi possível calcular esta combinação."),
  ).toHaveCount(0);

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(live).toContainText("310 g");
  await expect(live).toContainText("Na meta · dentro da margem");
  await expect(live).not.toContainText("170 g");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Escolher outra refeição" }).click();
  await expect(page.getByRole("heading", { name: "Guia de refeições" })).toBeVisible();
  await page.getByRole("link", { name: /Jantar/ }).click();
  await expect(page.getByRole("heading", { name: "Jantar" })).toBeVisible();
  await expect(page.getByText("550 kcal").first()).toBeVisible();
  await expect(page.getByText("Escolha um carboidrato e uma proteína.")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("arroz com feijão divide a porção dos dois carboidratos", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");

  const extraCarbohydrates = page.getByRole("group", {
    name: "Segundo carboidrato (opcional)",
  });
  const beans = extraCarbohydrates.getByRole("radio", {
    name: /Feijão carioca/,
  });
  await beans.click();
  await expect(beans).toBeChecked();
  await expect(page).toHaveURL(/carb2=feijao-carioca/);
  await expect(live).toContainText("80 g");
  await expect(live).toContainText("105 kcal");
  await expect(live).toContainText("150 g");
  await expect(live).toContainText("107 kcal");
  await expect(live).toContainText("220 g");
  await expect(live).toContainText("541 kcal");
  await expect(live).toContainText("cozido com caldo, sem óleo, sem sal");
  await expect(live).toContainText("BRC0001T");
  await expect(live).not.toContainText("170 g");
  await expect(live).not.toContainText("NaN");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const noSecond = extraCarbohydrates.getByRole("radio", {
    name: "Sem segundo carboidrato",
  });
  await noSecond.click();
  await expect(noSecond).toBeChecked();
  await expect(live).toContainText("170 g");
  await expect(live).not.toContainText("150 g");
  expect(consoleErrors).toEqual([]);
});

test("troca de refeição pela URL preserva alimentos válidos", async ({ page }) => {
  await page.goto(
    "/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango",
  );
  await expect(page.locator("[aria-live='polite']")).toContainText("553 kcal");
  await page.goto(
    "/refeicoes/dinner?carb=arroz-branco&carb2=feijao-preto&protein=peito-de-frango",
  );
  await expect(page.getByRole("heading", { name: "Jantar" })).toBeVisible();
  await expect(page.locator("[aria-live='polite']")).toContainText("80 g");
  await expect(page.locator("[aria-live='polite']")).toContainText("Feijão preto");
  await page.goto(
    "/refeicoes/lunch?carb=arroz-branco&carb2=arroz-branco&protein=peito-de-frango",
  );
  await expect(page.locator("[aria-live='polite']")).toContainText("170 g");
});
