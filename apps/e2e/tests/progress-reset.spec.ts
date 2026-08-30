import { expect, test } from "@playwright/test";

import { copyMinimalProject } from "../helpers/project.js";
import { mapNode, openProject, STATUS_BG } from "../helpers/ui.js";
import tokens from "../../../design/learning-map/tokens.json" with { type: "json" };

test("clicking an active status clears it back to unset", async ({ page }) => {
  const projectDir = await copyMinimalProject();
  await openProject(page, projectDir);

  const node = mapNode(page, "Pod basics");
  await node.click();
  const done = page.getByRole("button", { name: "Done" });
  await done.click();
  await expect(node).toHaveCSS("background-color", STATUS_BG.done);
  await expect(done).toHaveAttribute("aria-pressed", "true");

  await done.click();
  await expect(node).toHaveCSS("background-color", tokens.topic.backgroundRgb);
  await expect(done).toHaveAttribute("aria-pressed", "false");
});
