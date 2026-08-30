import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  copySingleNodeProject,
  copyThreeNodeProject,
  copyTwoNodeProject,
  readGraphFile,
} from "../helpers/project.js";
import { mapNode, openNodeDrawer, openProject, selectMapNode } from "../helpers/ui.js";

test("click selects a card without opening the drawer", async ({ page }) => {
  const projectDir = await copyTwoNodeProject();
  await openProject(page, projectDir);

  await selectMapNode(page, "Minimal example");
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
