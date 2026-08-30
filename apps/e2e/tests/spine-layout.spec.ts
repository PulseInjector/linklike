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

test("section frames do not capture canvas pan", async ({ page }) => {
  const projectDir = await copySpineProject();
  await openProject(page, projectDir);

  const section = page.locator(".react-flow__node-section").first();
  await expect(section).toBeVisible();
  await expect(section).toHaveCSS("pointer-events", "none");

  const point = await section.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cards = [...document.querySelectorAll(".map-node")].map((node) =>
      node.getBoundingClientRect(),
    );
    for (let y = rect.top + 2; y < rect.bottom - 2; y += 4) {
      for (let x = rect.left + 2; x < rect.right - 2; x += 4) {
        const onCard = cards.some(
          (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
        );
        if (!onCard) {
          return { x, y };
        }
      }
    }
    return null;
  });
  expect(point).toBeTruthy();

  const viewport = page.locator(".react-flow__viewport");
  const before = await viewport.evaluate((el) => el.style.transform);

  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x + 80, point!.y + 60);
  await page.mouse.up();

  const after = await viewport.evaluate((el) => el.style.transform);
  expect(after).not.toBe(before);
});

test("reference map titles match the Data Engineer topics", async ({ page }) => {
  const projectDir = await copyReferenceMap();
  await openProject(page, projectDir);

  await expect(mapNode(page, "Data Engineer")).toBeVisible();
  await expect(mapNode(page, "Introduction")).toBeVisible();
  await expect(mapNode(page, "What is Data Engineering?")).toBeVisible();
  await expect(page.locator(".map-section").first()).toBeVisible();
});

test("reference map opens on the root at a readable zoom", async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  const projectDir = await copyReferenceMap();
  await openProject(page, projectDir);

  const root = mapNode(page, "Data Engineer");
  await expect(root).toBeVisible();
  const box = await root.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThan(80);
  expect(box!.y).toBeGreaterThan(40);
  expect(box!.y).toBeLessThan(240);
  await expect(mapNode(page, "Introduction")).toBeVisible();
});
