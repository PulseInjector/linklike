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
  await expect(page.getByRole("alert")).toContainText("Could not open this project");

  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not open this project");
  await expect(page.getByRole("button", { name: "Open project" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reload" })).toHaveCount(0);

  await repairProjectJson(projectDir);
  // Playwright click waits for a stable box; Open unmounts when the map opens.
  await page.locator("form").evaluate((form) => {
    form.requestSubmit();
  });

  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.locator(".topbar-title strong")).toHaveText("minimal");
});
