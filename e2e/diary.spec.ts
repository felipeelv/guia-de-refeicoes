import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("as abas alternam entre cardápio e diário", async ({ page }) => {
  await page.goto("/felipe");
  await page.getByRole("link", { name: "Diário" }).click();
  await expect(page).toHaveURL(/\/felipe\/diario$/);
  await expect(page.getByRole("heading", { name: "Diário de Felipe" })).toBeVisible();
  await page.getByRole("link", { name: "Cardápio" }).click();
  await expect(page).toHaveURL(/\/felipe$/);
});

test("registrar consumo soma calorias e ajusta o cardápio restante", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/felipe/diario");
  await expect(page.getByText("Nada registrado ainda.")).toBeVisible();

  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("500");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await expect(page.getByText("655 kcal").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remover Arroz branco" }),
  ).toBeVisible();
  await expectNoOverflow(page);

  await page.reload();
  await expect(page.getByText("655 kcal").first()).toBeVisible();

  await page.goto("/felipe/refeicoes/dinner?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("160 g");
  await expect(live).not.toContainText("170 g");
  await expect(live).not.toContainText("kcal");
  expect(consoleErrors).toEqual([]);
});

test("o botão do builder registra a refeição calculada no diário", async ({
  page,
}) => {
  await page.goto("/felipe/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  await page
    .getByRole("button", { name: "Registrar esta refeição" })
    .click();
  await expect(
    page.getByRole("button", { name: "Registrado no diário" }),
  ).toBeDisabled();

  await page.goto("/felipe/diario");
  await expect(page.getByText("553 kcal").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remover Arroz branco" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remover Peito de frango" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remover Arroz branco" }).click();
  await expect(page.getByText("330 kcal").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remover Arroz branco" }),
  ).toHaveCount(0);
});
