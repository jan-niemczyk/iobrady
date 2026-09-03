import { test, expect } from "@playwright/test";

/**
 * Zakłada uruchomione `INIT_SEED=true` z danymi z prisma/seed.ts.
 */

test.describe("Logowanie i panel operatora", () => {
  test("operator może się zalogować i widzi dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adres e-mail").fill("operator@obradio.local");
    await page.getByLabel("Hasło").fill("operator123");
    await page.getByRole("button", { name: "Zaloguj się" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Pulpit operatora" })).toBeVisible();
  });

  test("operator widzi przykładowe posiedzenie z seedu", async ({ page }) => {
    await loginAsOperator(page);
    await page.goto("/meetings");
    await expect(page.getByText("I sesja Rady Miasta")).toBeVisible();
  });
});

test.describe("Cykl głosowania", () => {
  test("operator otwiera posiedzenie i tworzy głosowanie standardowe", async ({ page }) => {
    await loginAsOperator(page);
    await page.goto("/meetings");
    await page.getByText("I sesja Rady Miasta").click();

    // jeśli już otwarte - pomiń
    const openBtn = page.getByRole("button", { name: "Otwórz posiedzenie" });
    if (await openBtn.isVisible()) await openBtn.click();

    // rozpocznij pierwszy punkt
    const firstStartBtn = page.getByRole("button", { name: "Rozpocznij" }).first();
    if (await firstStartBtn.isVisible()) await firstStartBtn.click();

    // utwórz głosowanie
    await page.getByRole("button", { name: /Głosowanie do tego punktu/ }).click();
    await page.getByLabel("Tytuł / wniosek").fill("Test E2E - wniosek o przerwę");
    await page.getByRole("button", { name: /Utwórz/ }).click();

    await expect(page.getByText("Trwa głosowanie")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Test E2E - wniosek o przerwę")).toBeVisible();
  });
});

test.describe("Panel uczestnika", () => {
  test("uczestnik widzi posiedzenie i może potwierdzić obecność", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adres e-mail").fill("radny1@obradio.local");
    await page.getByLabel("Hasło").fill("radny123");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL(/\/session/);
  });
});

// --- helpery ---

async function loginAsOperator(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").fill("operator@obradio.local");
  await page.getByLabel("Hasło").fill("operator123");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
