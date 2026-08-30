/**
 * Audit blocker B1/B2 (adversarial A & B): Reload should refresh markdown
 * for an already-open node after the file changes on disk.
 */
import { expect, test } from "@playwright/test";

import { copyMinimalProject, writeNodeMarkdown } from "../helpers/project.js";
import { openProject } from "../helpers/ui.js";

test("reload refreshes open node markdown after disk edit", async ({ page }) => {
  const projectDir = await copyMinimalProject();

  await openProject(page, projectDir);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Minimal example" })
    .click();
  await expect(page.locator(".drawer .markdown")).toContainText("Fixture project");

  await writeNodeMarkdown(
    projectDir,
    "root",
    "# Minimal example\n\nUpdated on disk for e2e.\n",
  );

  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator(".drawer .markdown")).toContainText(
    "Updated on disk for e2e.",
  );
});
