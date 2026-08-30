import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import tokens from "../../../design/learning-map/tokens.json" with { type: "json" };
import { copyMinimalProject } from "../helpers/project.js";
import { mapNode, openProject } from "../helpers/ui.js";

const screenshots = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../design/learning-map/screenshots",
);

test("home and map use the checked-in light tokens", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    tokens.page.backgroundRgb,
  );

  const projectDir = await copyMinimalProject();
  await openProject(page, projectDir);

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    tokens.page.backgroundRgb,
  );

  const topic = mapNode(page, "Kubernetes overview");
  const subtopic = mapNode(page, "Cluster DNS");
  await expect(topic).toHaveCSS("background-color", tokens.topic.backgroundRgb);
  await expect(topic).toHaveCSS("color", tokens.topic.colorRgb);
  await expect(topic).toHaveCSS("border-top-color", tokens.topic.borderRgb);
  await expect(topic).toHaveCSS("font-size", tokens.font.size);
  await expect(subtopic).toHaveCSS("background-color", tokens.subtopic.backgroundRgb);
  await expect(subtopic).toHaveCSS("color", tokens.subtopic.colorRgb);
  await expect(subtopic).toHaveCSS("border-top-color", tokens.subtopic.borderRgb);
  await expect(subtopic).toHaveCSS("font-size", tokens.font.size);
  await expect(page.locator(".react-flow__edge-smoothstep")).not.toHaveCount(0);
  await expect(page.locator(".react-flow__edge-bezier")).toHaveCount(0);

  await mapNode(page, "Pod basics").click();
  await expect(page.locator(".drawer h2")).toHaveText("Pod basics");

  await access(path.join(screenshots, "topic.png"));
  await access(path.join(screenshots, "subtopic.png"));
  await access(path.join(screenshots, "section.png"));
});
