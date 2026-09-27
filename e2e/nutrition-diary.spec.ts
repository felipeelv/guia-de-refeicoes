import { expect, test } from "@playwright/test";

test("o diário mostra consumo, meta, saldo e a frase de macros ainda não configurados", async ({
  page,
}) => {
  await page.goto("/felipe/diario");
  await expect(page.getByText("Nada registrado ainda.")).toBeVisible();
  await expect(page.getByText("Meta de macros ainda não configurada")).toBeVisible();
  await expect(
    page.getByText(
      "Uma refeição com qualquer lançamento fica fora da redistribuição até o último registro ser removido.",
    ),
  ).toBeVisible();

  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("500");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("655 kcal").first()).toBeVisible();
  await expect(page.getByText(/Saldo:/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("655 kcal").first()).toBeVisible();
});

test("editar e remover atualizam o saldo e a gordura desconhecida não vira zero", async ({
  page,
}) => {
  await page.goto("/gabriela/diario");
  await page.getByRole("radio", { name: "Lanche" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Maçã" });
  await page.getByLabel("Quantidade em gramas").fill("100");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("59 kcal").first()).toBeVisible();
  const entry = page.getByRole("listitem").filter({ hasText: "Maçã" });
  await expect(entry.getByText("Gorduras: total parcial")).toBeVisible();
  await expect(entry).not.toContainText("Gorduras: 0 g");

  await page.getByRole("button", { name: "Editar Maçã" }).click();
  await page.getByLabel("Gramas de Maçã").fill("200");
  await page.getByRole("button", { name: "Atualizar quantidade" }).click();
  await expect(page.getByText("118 kcal").first()).toBeVisible();

  await page.getByRole("button", { name: "Remover Maçã" }).click();
  await expect(page.getByText("Nada registrado ainda.")).toBeVisible();
});

test("outra aba recebe o lançamento pelo armazenamento", async ({ page, context }) => {
  await page.goto("/kelly/diario");
  await expect(page.getByRole("heading", { name: "Diário de Kelly" })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/kelly/diario");
  await expect(other.getByRole("heading", { name: "Diário de Kelly" })).toBeVisible();

  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("500");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("655 kcal").first()).toBeVisible();
  await expect(other.getByText("655 kcal").first()).toBeVisible();
});

test("energia esgotada não sugere porção zero nem pular a refeição", async ({ page }) => {
  await page.goto("/felipe/diario");
  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("2000");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText(/excesso de/).first()).toBeVisible();

  await page.goto("/felipe/refeicoes/dinner?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("A meta de energia do dia foi ultrapassada.");
  await expect(live).toContainText("O registro manual continua disponível no diário.");
  await expect(live).not.toContainText("Porções dentro da margem");
  await expect(live).not.toContainText("0 g");
  await expect(page.getByText(/pule a refeição|pular a refeição/i)).toHaveCount(0);
});

test("registrar a refeição calculada entra uma vez e o jantar legado fica em 160 g", async ({
  page,
}) => {
  await page.goto("/felipe/refeicoes/lunch?carb=arroz-branco&protein=peito-de-frango");
  const register = page.getByRole("button", { name: "Registrar esta refeição" });
  await register.click();
  await expect(page.getByRole("button", { name: "Registrado no diário" })).toBeDisabled();
  await page.goto("/felipe/diario");
  await expect(page.getByText("553 kcal").first()).toBeVisible();
  await page.getByRole("button", { name: "Remover Arroz branco" }).click();
  await expect(page.getByText("330 kcal").first()).toBeVisible();

  await page.goto("/felipe/diario");
  await page.getByRole("button", { name: "Remover Peito de frango" }).click();
  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("500");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await page.goto("/felipe/refeicoes/dinner?carb=arroz-branco&protein=peito-de-frango");
  const live = page.locator("[aria-live='polite']");
  await expect(live).toContainText("160 g");
  await expect(live).not.toContainText("170 g");
  await expect(live).not.toContainText("kcal");
});

test("a virada do dia em São Paulo abre um diário novo com a aba aberta", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-27T02:59:30.000Z") });
  await page.goto("/felipe/diario");
  await expect(page.locator("[data-date]")).toHaveAttribute("data-date", "2026-09-26");
  await page.getByRole("radio", { name: "Almoço" }).check();
  await page.getByLabel("Alimento").selectOption({ label: "Arroz branco" });
  await page.getByLabel("Quantidade em gramas").fill("100");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("button", { name: "Remover Arroz branco" })).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.locator("[data-date]")).toHaveAttribute("data-date", "2026-09-27");
  await expect(page.getByText("Nada registrado ainda.")).toBeVisible();
});
