import { expect, test } from "@playwright/test";
import { fillFemaleMaintain, openQuestionnaire } from "./diet-flow.ts";

test("o modo legado não se apresenta como otimização de macros", async ({ page }) => {
  await page.goto("/felipe/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");
  await expect(live).toContainText("220 g");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("Combinação dentro das metas calculadas");
  await expect(live).not.toContainText("kcal");
  await expect(page.getByRole("button", { name: "Adicionar outra proteína" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Segunda proteína (opcional)" })).toHaveCount(0);
});

test("café e almoço aceitam segunda proteína e o mesmo alimento não ocupa dois lugares", async ({
  page,
}) => {
  await page.goto("/felipe/refeicoes/breakfast?carb=pao-frances&protein=ovo");
  await expect(page.getByRole("button", { name: "Adicionar outra proteína" })).toHaveCount(0);
  const proteins = page.getByRole("group", { name: "Proteína", exact: true });
  const egg = proteins.getByRole("checkbox", { name: /Ovo/ });
  await expect(egg).toBeChecked();
  await proteins.getByRole("checkbox", { name: /Iogurte natural/ }).click();
  await expect(egg).toBeChecked();
  await expect(page).toHaveURL(/protein2=iogurte-natural/);
  await proteins.getByRole("checkbox", { name: /Leite integral/ }).click();
  await expect(page).not.toHaveURL(/leite-integral/);
  await expect(proteins.getByRole("checkbox", { name: /Leite integral/ })).not.toBeChecked();
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("Iogurte natural");
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("kcal");
});

test("jantar ignora protein2 e uma URL inválida não seleciona o alimento", async ({ page }) => {
  await page.goto(
    "/felipe/refeicoes/dinner?carb=arroz-branco&protein=peito-de-frango&protein2=ovo",
  );
  await expect(page.getByRole("group", { name: "Segunda proteína (opcional)" })).toHaveCount(0);
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("170 g");
  await expect(live).not.toContainText("Ovo");

  await page.goto("/felipe/refeicoes/lunch?carb=peito-de-frango&protein=arroz-branco");
  await expect(page.getByRole("group", { name: "Carboidrato", exact: true }).getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Proteína", exact: true }).getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(page.getByText("Escolha um carboidrato e uma proteína.")).toBeVisible();
});

test("alergia a glúten tira o macarrão da sugestão e da URL", async ({ page }) => {
  await openQuestionnaire(page, "gabriela");
  await fillFemaleMaintain(page, { gluten: true });
  await page.getByRole("button", { name: "Aplicar ao meu perfil" }).click();
  await expect(page.getByText(/Plano em vigor hoje/)).toBeVisible();
  await page.goto("/gabriela/refeicoes/lunch?carb=macarrao&protein=peito-de-frango");
  await expect(page.getByRole("checkbox", { name: /Macarrão/ })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Carboidrato", exact: true }).getByRole("checkbox", { checked: true }),
  ).toHaveCount(0);
});

test("maçã sem gordura fica de fora da otimização e continua calculável pela energia", async ({
  page,
}) => {
  await openQuestionnaire(page, "gabriela");
  await fillFemaleMaintain(page);
  await page.getByRole("button", { name: "Aplicar ao meu perfil" }).click();
  await expect(page.getByText(/Plano em vigor hoje/)).toBeVisible();
  await page.goto("/gabriela/refeicoes/snack?carb=maca&protein=ovo");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("Falta informação nutricional para otimizar esta combinação.");
  await expect(live).toContainText(/Nutriente desconhecido em maca: gordura/);
  await expect(live).toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("Combinação dentro das metas calculadas");
});
