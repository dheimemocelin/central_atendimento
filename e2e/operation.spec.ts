import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("login, carteira isolada, histórico persistente, retorno e logout", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Acesse sua operação" }),
  ).toBeVisible();
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    timeout: 10000,
    path: `.impeccable/review/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("E-mail", { exact: true }).fill("a@crm.test");
  await page.getByLabel("Senha", { exact: true }).fill("Acesso de teste 2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Evolução dos atendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    timeout: 10000,
    path: `.impeccable/review/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Abrir carteira" }).click();
  await expect(
    page.getByText("Dado de teste · Carteira A", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Dado de teste · Carteira B", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    timeout: 10000,
    path: `.impeccable/review/board-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /^Dado de teste · Carteira A/ })
    .click();
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Resultado", exact: true })
    .selectOption({ label: "Contato efetivo" });
  const note = `Interação E2E ${testInfo.project.name}`;
  await page.getByLabel("Observação", { exact: true }).fill(note);
  await page
    .getByRole("button", { name: "Registrar interação", exact: true })
    .click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page
    .getByText("Mover etapa ou registrar encerramento", { exact: true })
    .click();
  const stageSelect = page.getByRole("combobox", {
    name: "Próxima etapa",
    exact: true,
  });
  await expect(stageSelect.locator('option[value="active"]')).toHaveText(
    "Em atendimento",
  );
  await stageSelect.selectOption("active");
  await page.getByRole("button", { name: "Salvar etapa", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Alteração salva." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retornos", exact: true }).click();
  await page
    .getByLabel("Próxima ação", { exact: true })
    .fill("Retorno de teste");
  await page
    .getByLabel("Data e hora · Porto Velho", { exact: true })
    .fill("2026-01-01T10:00");
  await page
    .getByRole("button", { name: "Agendar retorno", exact: true })
    .click();
  await expect(
    page.getByText(/Atrasado/, { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    timeout: 10000,
    path: `.impeccable/review/drawer-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar lead", exact: true }).click();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua operação" }),
  ).toBeVisible();
});
