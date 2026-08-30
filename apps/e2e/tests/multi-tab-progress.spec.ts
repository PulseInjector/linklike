import { expect, test } from "@playwright/test";

import { copyTwoNodeProject } from "../helpers/project.js";
import { mapNode, openProjectFromUrl, STATUS_BG } from "../helpers/ui.js";

test("second tab keeps root done after updating another node", async ({ browser }) => {
  const projectDir = await copyTwoNodeProject();
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await openProjectFromUrl(tabA, projectDir);
  await openProjectFromUrl(tabB, projectDir);

  await mapNode(tabA, "Minimal example").click();
  await tabA.getByRole("button", { name: "Done" }).click();
  await expect(mapNode(tabA, "Minimal example")).toHaveCSS(
    "background-color",
    STATUS_BG.done,
  );

  await mapNode(tabB, "Second topic").click();
  await tabB.getByRole("button", { name: "Skip" }).click();

  await expect(mapNode(tabB, "Minimal example")).toHaveCSS(
    "background-color",
    STATUS_BG.done,
  );

  await context.close();
});
