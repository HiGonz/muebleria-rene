import { test, expect } from "@playwright/test";
import path from "node:path";

const SHOT_DIR = path.join(__dirname, "screenshots");

test.describe("Login → Diseñar cocina", () => {
  test("logs in, adds a module, and walks through all three builder tabs", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const shot = (name: string) =>
      page.screenshot({ path: path.join(SHOT_DIR, `${testInfo.project.name.replace(/\s+/g, "-")}-${name}.png`) });

    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto("/login");
    await shot("01-login");
    await page.fill('input[name="email"]', "admin@demo.com");
    await page.fill('input[name="password"]', "password");
    await page.click('button:has-text("Entrar")');
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await shot("02-dashboard");

    // ── Kitchen builder ───────────────────────────────────────────────────
    await page.goto("/kitchen");
    await shot("03-builder-empty");

    // Accessible-name match covers both the desktop "+ Agregar módulo" button
    // and the mobile FAB (icon-only, labelled via aria-label).
    await page.getByRole("button", { name: /Agregar/i }).first().click();
    const chip = page.locator("text=Cajonera").first();
    await expect(chip).toBeVisible();
    await chip.click({ force: true }); // sibling card sometimes overlaps the click point at narrow widths
    await shot("04-module-added");

    // Module count badge should now read 1
    await expect(page.locator("text=1 módulo")).toBeVisible();

    // ── 3D tab ─────────────────────────────────────────────────────────────
    await page.locator('button:has-text("Vista 3D"):visible').first().click();
    await page.waitForTimeout(1000); // let the WebGL scene mount
    await shot("05-3d-view");
    // Deliberately not asserting on canvas pixel content: headless/software-GL
    // sandboxes can lose the WebGL context under this project's CI-like
    // conditions, which is an environment limitation, not an app bug.

    // ── Summary tab ────────────────────────────────────────────────────────
    await page.locator('button:has-text("Resumen"):visible').first().click();
    await page.waitForTimeout(300);
    await shot("06-summary");
    await expect(page.locator("text=Total estimado").first()).toBeVisible();

    expect(pageErrors, `Unexpected page errors: ${pageErrors.join(", ")}`).toEqual([]);
  });
});
