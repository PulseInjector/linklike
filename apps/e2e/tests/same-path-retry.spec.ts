/**
 * Audit blocker B1/B2 (adversarial A & B): submitting the same path again
 * after a failed open must retry loading once the project is fixed on disk.
 */
import { expect, test } from "@playwright/test";

import {
  copyMinimalProject,
  corruptProjectJson,
  repairProjectJson,
} from "../helpers/project.js";

test("same path retries after validation failure is repaired", async ({ page }) => {
  const projectDir = await copyMinimalProject();
  await corruptProjectJson(projectDir);

  await page.goto("/");
  await page.locator("#path-input").fill(projectDir);
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not open this project");

  await repairProjectJson(projectDir);
  await page.getByRole("button", { name: "Open project" }).click();

  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.locator(".topbar-title strong")).toHaveText("minimal");
});
