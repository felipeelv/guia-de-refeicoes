import { expect, type Page } from "@playwright/test";

export async function openQuestionnaire(page: Page, person: "felipe" | "gabriela" | "kelly") {
  await page.goto(`/${person}`);
  await page.getByRole("link", { name: "Começar" }).click();
  await expect(page.getByRole("heading", { name: "Calcule sua dieta" })).toBeVisible();
}

export async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Continuar" }).click();
}

/** Homem, 35 anos, 80 kg, 180 cm, moderada, perder. Não aplica o plano. */
export async function fillMaleLose(page: Page) {
  await page.getByLabel("Idade em anos completos").fill("35");
  await page.getByLabel("Valor da altura").fill("180");
  await page.getByLabel("Peso atual em quilogramas").fill("80");
  await page.getByRole("radio", { name: "Coeficiente masculino" }).check();
  await continueStep(page);
  await page.getByRole("radio", { name: "Perder peso" }).check();
  await page.getByRole("radio", { name: /Moderada/ }).check();
  await continueStep(page);
  await continueStep(page);
  await continueStep(page);
}

export async function fillFemaleMaintain(page: Page, options?: { gluten?: boolean }) {
  await page.getByLabel("Idade em anos completos").fill("30");
  await page.getByLabel("Valor da altura").fill("165");
  await page.getByLabel("Peso atual em quilogramas").fill("60");
  await page.getByRole("radio", { name: "Coeficiente feminino" }).check();
  await continueStep(page);
  await page.getByRole("radio", { name: "Manter peso" }).check();
  await page.getByRole("radio", { name: /Leve/ }).check();
  await continueStep(page);
  if (options?.gluten) {
    await page.getByRole("radio", { name: "Informar" }).check();
    await page.getByRole("checkbox", { name: "Glúten" }).check();
  }
  await continueStep(page);
  await continueStep(page);
}
