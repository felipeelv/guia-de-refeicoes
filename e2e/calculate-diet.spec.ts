import { expect, test } from "@playwright/test";
import { continueStep, fillMaleLose, openQuestionnaire } from "./diet-flow.ts";

const DISCLAIMER =
  "Estimativa automática para uso experimental. Não é uma prescrição alimentar nem uma avaliação clínica.";

test("o cardápio oferece o questionário sem calorias e sem misturar com a lista de refeições", async ({
  page,
}) => {
  await page.goto("/felipe");
  await expect(page.getByRole("heading", { name: "Calcule sua dieta" })).toBeVisible();
  await expect(
    page.getByText("Responda algumas perguntas para personalizar suas metas e porções"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Começar" })).toBeVisible();
  const meals = page.getByRole("list").getByRole("link");
  await expect(meals).toHaveCount(5);
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("kcal");
});

test("voltar mantém os campos, cancelar não confirma e outra pessoa começa vazia", async ({
  page,
}) => {
  await openQuestionnaire(page, "felipe");
  await page.getByLabel("Idade em anos completos").fill("41");
  await continueStep(page);
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByLabel("Idade em anos completos")).toHaveValue("41");
  await page.getByRole("link", { name: "Cancelar" }).click();
  await expect(page).toHaveURL(/\/felipe$/);
  await expect(page.getByRole("link", { name: "Minha dieta" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Começar" })).toBeVisible();

  await page.getByRole("link", { name: "Começar" }).click();
  await expect(page.getByLabel("Idade em anos completos")).toHaveValue("41");
  await page.getByRole("combobox", { name: "Pessoa" }).selectOption("gabriela");
  await expect(page).toHaveURL(/\/gabriela\/calcular-dieta/);
  await expect(page.getByLabel("Idade em anos completos")).toHaveValue("");
  await expect(page.getByLabel("Peso atual em quilogramas")).toHaveValue("");
});

test("altura em metros pede conferência em centímetros e a vírgula decimal entra", async ({
  page,
}) => {
  await openQuestionnaire(page, "kelly");
  await page.getByRole("radio", { name: "metros", exact: true }).check();
  await page.getByLabel("Valor da altura").fill("1,62");
  await expect(page.getByText("Altura para conferência: 162 cm")).toBeVisible();
});

test("a proposta 8.7 mostra o cálculo, o aviso e só entra no perfil ao aplicar", async ({
  page,
}) => {
  await openQuestionnaire(page, "felipe");
  await fillMaleLose(page);
  await expect(page.getByText("2.310 kcal")).toBeVisible();
  await expect(page.getByText("144,375 g")).toBeVisible();
  await expect(page.getByText("259,875 g")).toBeVisible();
  await expect(page.getByText("77 g")).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await page.getByText("Como foi calculado").click();
  await expect(page.getByText(/Mifflin–St Jeor/)).toBeVisible();
  await expect(page.getByText(/experimental-v1/)).toBeVisible();
  await page.getByRole("button", { name: "Aplicar ao meu perfil" }).click();
  await expect(page.getByText(/Plano em vigor hoje/)).toBeVisible();

  await page.goto("/felipe");
  await expect(page.getByRole("link", { name: "Minha dieta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recalcular" })).toBeVisible();
  await expect(page.getByText(/Última configuração:/)).toBeVisible();
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("kcal");
  await expect(page.getByRole("list").getByRole("link")).toHaveCount(5);

  await page.getByRole("link", { name: "Minha dieta" }).click();
  await expect(page.getByRole("heading", { name: "Minha dieta" })).toBeVisible();
  await expect(page.getByText("2.310 kcal")).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
});

test("perfil sem apoio mantém o plano anterior e não aplica a estimativa", async ({
  page,
}) => {
  await openQuestionnaire(page, "felipe");
  await fillMaleLose(page);
  await page.getByRole("button", { name: "Aplicar ao meu perfil" }).click();
  await expect(page.getByText(/Plano em vigor hoje/)).toBeVisible();
  await page.getByRole("button", { name: "Editar respostas" }).click();
  await continueStep(page);
  await continueStep(page);
  await page
    .getByRole("group", { name: "Gestação ou amamentação" })
    .getByRole("radio", { name: "Sim" })
    .check();
  await continueStep(page);
  await continueStep(page);
  await expect(
    page.getByText("A estimativa não foi concluída. O plano anterior permanece."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar ao meu perfil" })).toBeDisabled();
  await page.goto("/felipe/minha-dieta");
  await expect(page.getByText("2.310 kcal")).toBeVisible();
});

test("consumo no dia agenda o plano para o dia seguinte", async ({ page }) => {
  await page.goto("/felipe/diario");
  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("500");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("655 kcal").first()).toBeVisible();

  await openQuestionnaire(page, "felipe");
  await fillMaleLose(page);
  await page.getByRole("button", { name: "Aplicar ao meu perfil" }).click();
  await expect(page.getByText(/O dia já tem consumo/)).toBeVisible();
  await expect(page.getByText(/Plano em vigor hoje/)).toHaveCount(0);

  await page.goto("/felipe/minha-dieta");
  await expect(page.getByRole("heading", { name: "Proposta agendada" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar proposta agendada" }).click();
  await expect(page.getByRole("heading", { name: "Proposta agendada" })).toHaveCount(0);
});

test("falha de gravação avisa e não diz que salvou", async ({ page }) => {
  await page.addInitScript(() => {
    const storage = window.localStorage;
    storage.setItem = () => {
      throw new Error("quota");
    };
  });
  await page.goto("/felipe");
  await expect(page.getByText("Alterações não salvas neste dispositivo")).toBeVisible();
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("salvo com sucesso");
});
