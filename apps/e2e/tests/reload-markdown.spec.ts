import { expect, test } from "@playwright/test";

import { copyMinimalProject, writeNodeMarkdown } from "../helpers/project.js";
import { openNodeDrawer, openProject } from "../helpers/ui.js";

test("reload refreshes open node markdown after disk edit", async ({ page }) => {
  const projectDir = await copyMinimalProject();

  await openProject(page, projectDir);
  await openNodeDrawer(page, "Minimal example");
  await expect(page.locator(".drawer .notes-document")).toContainText(
    "Fixture project",
  );

  await writeNodeMarkdown(
    projectDir,
    "root",
    "# Minimal example\n\nUpdated on disk for e2e.\n",
  );

  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator(".drawer .notes-document")).toContainText(
    "Updated on disk for e2e.",
  );
});
