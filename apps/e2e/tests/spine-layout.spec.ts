import { expect, test } from "@playwright/test";

import {
  addNodeViaCli,
  copyMinimalProject,
  copyReferenceMap,
  copySpineProject,
  readGraphFile,
} from "../helpers/project.js";
import { mapNode, openNodeDrawer, openProject } from "../helpers/ui.js";

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

  await openNodeDrawer(page, "Introduction");
  await expect(page.locator(".drawer h2")).toHaveText("Introduction");
});

test("adding a child under a leaf keeps the former leaf off the spine", async ({
  page,
}) => {
  const projectDir = await copySpineProject();
  await openProject(page, projectDir);

  const intro = mapNode(page, "Introduction");
  const what = mapNode(page, "What is Data Engineering?");
  const basics = mapNode(page, "Learn the Basics");
  const introBox = await intro.boundingBox();
  const whatBox = await what.boundingBox();
  const basicsBox = await basics.boundingBox();
  expect(introBox).toBeTruthy();
  expect(whatBox).toBeTruthy();
  expect(basicsBox).toBeTruthy();

  const introMidX = introBox!.x + introBox!.width / 2;
  expect(Math.abs(introMidX - (basicsBox!.x + basicsBox!.width / 2))).toBeLessThan(24);
  expect(Math.abs(introMidX - (whatBox!.x + whatBox!.width / 2))).toBeGreaterThan(40);

  await addNodeViaCli(projectDir, "Nested grandchild", "what-is-data-engineering");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(mapNode(page, "Nested grandchild")).toBeVisible();

  const introAfter = await mapNode(page, "Introduction").boundingBox();
  const whatAfter = await mapNode(page, "What is Data Engineering?").boundingBox();
  const basicsAfter = await mapNode(page, "Learn the Basics").boundingBox();
  const grandAfter = await mapNode(page, "Nested grandchild").boundingBox();
  const skillsAfter = await mapNode(page, "Skills and Responsibilities").boundingBox();
  expect(introAfter).toBeTruthy();
  expect(whatAfter).toBeTruthy();
  expect(basicsAfter).toBeTruthy();
  expect(grandAfter).toBeTruthy();
  expect(skillsAfter).toBeTruthy();

  const introMidAfter = introAfter!.x + introAfter!.width / 2;
  expect(
    Math.abs(introMidAfter - (basicsAfter!.x + basicsAfter!.width / 2)),
  ).toBeLessThan(24);
  expect(
    Math.abs(introMidAfter - (whatAfter!.x + whatAfter!.width / 2)),
  ).toBeGreaterThan(40);
  expect(grandAfter!.y).toBeGreaterThan(whatAfter!.y);
  expect(
    Math.abs(introMidAfter - (skillsAfter!.x + skillsAfter!.width / 2)),
  ).toBeGreaterThan(40);
});

test("a nested parent-child chain steps outboard instead of stacking", async ({
  page,
}) => {
  const projectDir = await copySpineProject();
  await addNodeViaCli(projectDir, "9999", "what-is-data-engineering");
  await addNodeViaCli(projectDir, "000", "9999");
  await openProject(page, projectDir);

  const what = mapNode(page, "What is Data Engineering?");
  const nested = mapNode(page, "9999");
  const child = mapNode(page, "000");
  await expect(nested).toBeVisible();
  await expect(child).toBeVisible();

  const whatBox = await what.boundingBox();
  const nestedBox = await nested.boundingBox();
  const childBox = await child.boundingBox();
  expect(whatBox).toBeTruthy();
  expect(nestedBox).toBeTruthy();
  expect(childBox).toBeTruthy();
  expect(Math.abs(whatBox!.x - nestedBox!.x)).toBeGreaterThan(40);
  expect(childBox!.y).toBeGreaterThan(nestedBox!.y);
});

test("minimal-project nests workloads beside kubernetes-overview", async ({ page }) => {
  const projectDir = await copyMinimalProject();
  await openProject(page, projectDir);

  const overview = mapNode(page, "Kubernetes overview");
  const workloads = mapNode(page, "Workloads");
  const pods = mapNode(page, "Pod basics");
  const replica = mapNode(page, "ReplicaSets");
  await expect(overview).toBeVisible();
  await expect(workloads).toBeVisible();

  const overviewBox = await overview.boundingBox();
  const workloadsBox = await workloads.boundingBox();
  const podsBox = await pods.boundingBox();
  const replicaBox = await replica.boundingBox();
  expect(overviewBox).toBeTruthy();
  expect(workloadsBox).toBeTruthy();
  expect(podsBox).toBeTruthy();
  expect(replicaBox).toBeTruthy();

  const overviewMidX = overviewBox!.x + overviewBox!.width / 2;
  const podsMidX = podsBox!.x + podsBox!.width / 2;
  const workloadsMidX = workloadsBox!.x + workloadsBox!.width / 2;
  expect(Math.abs(overviewMidX - podsMidX)).toBeLessThan(24);
  expect(Math.abs(overviewMidX - workloadsMidX)).toBeGreaterThan(40);
  expect(replicaBox!.y).toBeGreaterThan(workloadsBox!.y);
  await expect(page.locator(".map-section").first()).toBeVisible();
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
