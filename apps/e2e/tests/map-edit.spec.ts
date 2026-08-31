import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  copySingleNodeProject,
  copyThreeNodeProject,
  copyTwoNodeProject,
  readGraphFile,
} from "../helpers/project.js";
import {
  mapNode,
  openNodeDrawer,
  openProject,
  selectMapNode,
  clickEmptyMapCanvas,
} from "../helpers/ui.js";

test("click selects a card without opening the drawer", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Minimal example");
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("clicking the canvas hides node actions", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Second topic");
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible();

  await clickEmptyMapCanvas(page);

  await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("clicking the canvas cancels add", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  const before = await readGraphFile(projectDir);

  await selectMapNode(page, "Minimal example");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("New node title").fill("Should not save");
  await clickEmptyMapCanvas(page);

  await expect(page.getByLabel("New node title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(mapNode(page, "Should not save")).toHaveCount(0);
  expect(await readGraphFile(projectDir)).toEqual(before);
});

test("clicking the canvas cancels rename", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  const before = await readGraphFile(projectDir);

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Node title", { exact: true }).fill("Should not save");
  await clickEmptyMapCanvas(page);

  await expect(page.getByLabel("Node title", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(mapNode(page, "Second topic")).toBeVisible();
  await expect(mapNode(page, "Should not save")).toHaveCount(0);
  expect(await readGraphFile(projectDir)).toEqual(before);
});

test("delete is unavailable when it would remove every node", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Minimal example");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await selectMapNode(page, "Second topic");
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
});

test("double-click opens the notes drawer with the node title", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await mapNode(page, "Second topic").dblclick();
  await expect(page.locator(".drawer h2")).toHaveText("Second topic");
  await expect(page.locator(".drawer")).toBeVisible();
});

test("clicking add or delete is not treated as a double-click", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Minimal example");
  await page.getByRole("button", { name: "Add" }).dblclick();
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.getByLabel("New node title")).toBeVisible();
});

test("clicking rename is not treated as a double-click", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Rename" }).dblclick();
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.getByLabel("Node title", { exact: true })).toBeVisible();
});

test("add commits a non-empty title and does not persist position", async ({
  page,
}) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Minimal example");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("New node title").fill("Pod basics");
  await page.getByLabel("New node title").press("Enter");

  await expect(mapNode(page, "Pod basics")).toBeVisible();
  await expect(page.locator(".drawer")).toHaveCount(0);

  const graph = await readGraphFile(projectDir);
  expect(graph.nodes.some((node) => node.title === "Pod basics")).toBe(true);
  expect(graph.nodes.every((node) => !("position" in node))).toBe(true);
  expect(graph.edges).toContainEqual({ from: "root", to: "pod-basics" });
  await access(path.join(projectDir, "nodes", "pod-basics.mdx"));
});

test("add then Escape writes nothing", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  const before = await readGraphFile(projectDir);

  await selectMapNode(page, "Minimal example");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("New node title").fill("Should not save");
  await page.getByLabel("New node title").press("Escape");

  await expect(page.getByLabel("New node title")).toHaveCount(0);
  await expect(mapNode(page, "Should not save")).toHaveCount(0);
  const after = await readGraphFile(projectDir);
  expect(after.nodes).toEqual(before.nodes);
  await expect(
    access(path.join(projectDir, "nodes", "should-not-save.mdx")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("add with an empty title writes nothing", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  const before = await readGraphFile(projectDir);

  await selectMapNode(page, "Minimal example");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("New node title").press("Enter");

  await expect(page.getByLabel("New node title")).toHaveCount(0);
  const after = await readGraphFile(projectDir);
  expect(after.nodes).toEqual(before.nodes);
});

test("delete a leaf removes the card and the note file", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(mapNode(page, "Second topic")).toHaveCount(0);
  const graph = await readGraphFile(projectDir);
  expect(graph.nodes.map((node) => node.id)).toEqual(["root"]);
  await expect(
    access(path.join(projectDir, "nodes", "second.mdx")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("delete a parent with children confirms and removes the subtree", async ({
  page,
}) => {
  const projectDir = await copyThreeNodeProject();
  await openProject(page, projectDir);

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await selectMapNode(page, "Parent topic");
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(mapNode(page, "Parent topic")).toHaveCount(0);
  await expect(mapNode(page, "Child topic")).toHaveCount(0);
  await expect(mapNode(page, "Root topic")).toBeVisible();

  const graph = await readGraphFile(projectDir);
  expect(graph.nodes.map((node) => node.id)).toEqual(["root"]);
  expect(graph.edges).toEqual([]);
  const progress = JSON.parse(
    await readFile(path.join(projectDir, "progress.json"), "utf8"),
  ) as { entries: Record<string, unknown> };
  expect(progress.entries.parent).toBeUndefined();
  expect(progress.entries.child).toBeUndefined();
});

test("delete is unavailable when the graph has one node", async ({ page }) => {
  const projectDir = await copySingleNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Only node");
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("rename commits a non-empty title and keeps id and note file", async ({
  page,
}) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Second topic");
  const noteBefore = await readFile(
    path.join(projectDir, "nodes", "second.mdx"),
    "utf8",
  );

  await page.getByRole("button", { name: "Rename" }).click();
  const titleInput = page.getByLabel("Node title", { exact: true });
  await expect(titleInput).toHaveValue("Second topic");
  await titleInput.fill("Renamed topic");
  await titleInput.press("Enter");

  await expect(mapNode(page, "Renamed topic")).toBeVisible();
  await expect(page.locator(".drawer h2")).toHaveText("Renamed topic");

  const graph = await readGraphFile(projectDir);
  const renamed = graph.nodes.find((node) => node.id === "second");
  expect(renamed).toEqual({ id: "second", title: "Renamed topic" });
  expect(await readFile(path.join(projectDir, "nodes", "second.mdx"), "utf8")).toBe(
    noteBefore,
  );
});

test("rename Escape or empty title writes nothing", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);
  const before = await readGraphFile(projectDir);

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Node title", { exact: true }).fill("Should not save");
  await page.getByLabel("Node title", { exact: true }).press("Escape");

  await expect(page.getByLabel("Node title", { exact: true })).toHaveCount(0);
  await expect(mapNode(page, "Second topic")).toBeVisible();
  expect(await readGraphFile(projectDir)).toEqual(before);

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Node title", { exact: true }).fill("   ");
  await page.getByLabel("Node title", { exact: true }).press("Enter");

  await expect(page.getByLabel("Node title", { exact: true })).toHaveCount(0);
  await expect(mapNode(page, "Second topic")).toBeVisible();
  expect(await readGraphFile(projectDir)).toEqual(before);
});

test("add and rename do not run at the same time", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByLabel("Node title", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByLabel("Node title", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("New node title")).toBeVisible();
});

test("a longer title relayouts the map card", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  const before = await mapNode(page, "Second topic").boundingBox();
  expect(before).not.toBeNull();

  await selectMapNode(page, "Second topic");
  await page.getByRole("button", { name: "Rename" }).click();
  await page
    .getByLabel("Node title", { exact: true })
    .fill("A much longer title for the map card");
  await page.getByLabel("Node title", { exact: true }).press("Enter");

  const after = await mapNode(
    page,
    "A much longer title for the map card",
  ).boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width);
});
