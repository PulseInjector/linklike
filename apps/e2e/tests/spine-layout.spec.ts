import { expect, test } from "@playwright/test";

import {
  addNodeViaCli,
  copyReferenceMap,
  copySpineProject,
  readGraphFile,
} from "../helpers/project.js";
import { mapNode, openProject } from "../helpers/ui.js";

test("spine layout fans subtopics and keeps plan.graph.json free of position", async ({
  page,
}) => {
  const projectDir = await copySpineProject();
  await openProject(page, projectDir);

  const intro = mapNode(page, "Introduction");
  const what = mapNode(page, "What is Data Engineering?");
  const skills = mapNode(page, "Skills and Responsibilities");
  const basics = mapNode(page, "Learn the Basics");
  const lifecycle = mapNode(page, "Data Engineering Lifecycle");
  await expect(intro).toBeVisible();
  await expect(basics).toBeVisible();

  const introBox = await intro.boundingBox();
  const whatBox = await what.boundingBox();
  const skillsBox = await skills.boundingBox();
  const lifecycleBox = await lifecycle.boundingBox();
  const basicsBox = await basics.boundingBox();
  expect(introBox).toBeTruthy();
  expect(whatBox).toBeTruthy();
  expect(skillsBox).toBeTruthy();
  expect(lifecycleBox).toBeTruthy();
  expect(basicsBox).toBeTruthy();

  const introMidX = introBox!.x + introBox!.width / 2;
  const basicsMidX = basicsBox!.x + basicsBox!.width / 2;
  expect(Math.abs(introMidX - basicsMidX)).toBeLessThan(24);
  expect(basicsBox!.y).toBeGreaterThan(introBox!.y + introBox!.height / 2);

  const leafMids = [whatBox!, skillsBox!, lifecycleBox!].map(
    (box) => box.x + box.width / 2,
  );
  const leftOfParent = leafMids.some((x) => x < introBox!.x);
  const rightOfParent = leafMids.some((x) => x > introBox!.x + introBox!.width);
  expect(leftOfParent).toBe(true);
  expect(rightOfParent).toBe(true);

  await expect(page.locator(".map-section").first()).toBeVisible();

  const before = await readGraphFile(projectDir);
  expect(before.nodes.every((node) => !("position" in node))).toBe(true);

  await addNodeViaCli(projectDir, "Choosing the Right Technologies", "introduction");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(mapNode(page, "Choosing the Right Technologies")).toBeVisible();

  const after = await readGraphFile(projectDir);
  expect(after.nodes.every((node) => !("position" in node))).toBe(true);
  expect(
    after.nodes.some((node) => node.title === "Choosing the Right Technologies"),
  ).toBe(true);

  await mapNode(page, "Introduction").click();
  await expect(page.locator(".drawer h2")).toHaveText("Introduction");
});

test("reference map titles match the Data Engineer topics", async ({ page }) => {
  const projectDir = await copyReferenceMap();
  await openProject(page, projectDir);

  await expect(mapNode(page, "Data Engineer")).toBeVisible();
  await expect(mapNode(page, "Introduction")).toBeVisible();
  await expect(mapNode(page, "What is Data Engineering?")).toBeVisible();
  await expect(page.locator(".map-section").first()).toBeVisible();
});
