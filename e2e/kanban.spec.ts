import { expect, test } from "@playwright/test";

test("arraste pelo corpo do card persiste etapa e exige dados no encerramento", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Mouse verificado no desktop; responsividade conferida no mesmo fluxo.",
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page).toHaveTitle("Central · Atendimento");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@crm.test");
  await page.getByLabel("Senha", { exact: true }).fill("Acesso de teste 2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Abrir carteira", exact: true }).click();
  const card = page
    .locator(".lead-card")
    .filter({ hasText: "Lead de teste · Arraste" });
  await expect(card).toBeVisible();
  const id = await card.getAttribute("data-lead-id");
  async function dragTo(target: string) {
    const source = await card.locator(".card-main").boundingBox();
    const destination = await page
      .locator(`[data-stage-id="${target}"] > header`)
      .boundingBox();
    expect(source).toBeTruthy();
    expect(destination).toBeTruthy();
    await page.mouse.move(source!.x + 60, source!.y + 15);
    await page.mouse.down();
    await page.mouse.move(source!.x + 75, source!.y + 15, { steps: 3 });
    await expect(page.locator(".drag-preview")).toBeVisible();
    await page.mouse.move(destination!.x + 100, destination!.y + 25, {
      steps: 18,
    });
    await page.mouse.up();
  }
  const active = page.locator('[data-stage-id="active"]');
  await dragTo("active");
  await expect(
    active.getByText("Lead de teste · Arraste", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    active.getByText("Lead de teste · Arraste", { exact: true }),
  ).toBeVisible();
  await dragTo("new");
  await expect(page.getByRole("alert")).toContainText(
    "Transição não permitida",
  );
  await expect(
    active.getByText("Lead de teste · Arraste", { exact: true }),
  ).toBeVisible();
  await dragTo("won");
  await expect(
    page.getByRole("combobox", { name: "Próxima etapa", exact: true }),
  ).toHaveValue("won");
  const lead = await (await page.request.get(`/api/leads/${id}`)).json();
  expect(lead.stageId).toBe("active");
  expect(
    lead.events.some((e: { type: string }) => e.type === "STAGE_CHANGED"),
  ).toBe(true);
  await page.goBack();
  await page
    .getByRole("button", { name: /^Dado de teste · Carteira B/ })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: "Próxima etapa",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Fechar lead", exact: true }).click();
  await card.locator(".card-main").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fechar lead", exact: true }).click();
  await page.screenshot({
    path: ".impeccable/review/kanban-colors-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("heading", { name: "Carteira de leads", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: ".impeccable/review/kanban-colors-mobile.png",
    fullPage: true,
  });
});
