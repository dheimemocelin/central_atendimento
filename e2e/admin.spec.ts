import { expect, test } from "@playwright/test";
test("administrador cadastra acesso e importa com distribuição", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@crm.test");
  await page.getByLabel("Senha", { exact: true }).fill("Acesso de teste 2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Evolução dos atendimentos",
      exact: true,
    }),
  ).toBeVisible();
  async function navigate(name: string) {
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Abrir navegação" }).click();
    await page.getByRole("link", { name, exact: true }).click();
  }
  await navigate("Equipe");
  await page.getByRole("button", { name: "Adicionar pessoa" }).click();
  await page
    .getByLabel("Nome", { exact: true })
    .fill("Acesso de teste " + info.project.name);
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(`guest-${info.project.name}@crm.test`);
  await page.getByRole("button", { name: "Criar acesso" }).click();
  await expect(
    page.getByRole("heading", { name: "Código temporário de acesso" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ocultar código" }).click();
  await navigate("Importação");
  const suffix = info.project.name === "mobile" ? "5678" : "1234";
  await page.getByLabel("Arquivo de leads").setInputFiles({
    name: `leads-${info.project.name}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Nome;Telefone\nImportação teste A ${suffix};6998888${suffix}\nImportação teste B ${suffix};6997777${suffix}\n`,
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Mapear campos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Validar e revisar base" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisão do lote" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Freelancer A", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Freelancer B", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirmar importação e distribuição" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 leads importados" }),
  ).toBeVisible();
  await navigate("Carteira de leads");
  await page.getByRole("button", { name: "Redistribuir", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Freelancer A", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Freelancer B", exact: true })
    .check();
  await page
    .getByLabel("Justificativa", { exact: true })
    .fill("Distribuição equilibrada de teste");
  await page.getByRole("button", { name: "Confirmar redistribuição" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar redistribuição" }),
  ).toHaveCount(0);
});
test("BI responde aos filtros e barra lateral recolhe sem perder navegação", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@crm.test");
  await page.getByLabel("Senha", { exact: true }).fill("Acesso de teste 2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Evolução dos atendimentos",
      exact: true,
    }),
  ).toBeVisible();
  if (info.project.name === "desktop") {
    await page.getByRole("button", { name: "Recolher barra lateral" }).click();
    await expect(
      page.getByRole("button", { name: "Expandir barra lateral" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expandir barra lateral" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  }
  await page.getByRole("button", { name: "7 dias", exact: true }).click();
  await expect(
    page.getByLabel("Data inicial", { exact: true }),
  ).not.toHaveValue("");
  await expect(
    page.getByRole("heading", {
      name: "Evolução dos atendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Indicador do gráfico de evolução" })
    .selectOption("contacts");
  await page
    .getByRole("button", { name: "Filtrar etapa Novo", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Etapa", exact: true }),
  ).toHaveValue("new");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Etapa", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("heading", {
      name: "Evolução dos atendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver leads: Leads na operação", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Carteira de leads", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/metric=total/);
  await page
    .getByRole("button", { name: /^Dado de teste · Carteira A/ })
    .click();
  await expect(page).toHaveURL(/metric=total/);
  await page.getByRole("button", { name: "Fechar lead", exact: true }).click();
  await page.reload();
  await expect(page).toHaveURL(/metric=total/);
  await expect(
    page.getByRole("button", { name: "Ver carteira completa" }),
  ).toBeVisible();
});
