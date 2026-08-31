import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { copyMinimalProject, corruptProjectJson } from "../helpers/project.js";
import { expectProjectView } from "../helpers/ui.js";

test("initialize an empty directory then opens the map", async ({ page }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-init-"));
  const name = path.basename(dir);

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("status")).toContainText(
    "This folder is not a Linklike project yet",
  );
  await page.getByRole("button", { name: "Initialize" }).click();
  await expectProjectView(page);
  await expect(page.locator(".topbar-title strong")).toHaveText(name);

  const project = JSON.parse(
    await readFile(path.join(dir, "project.json"), "utf8"),
  ) as {
    name: string;
    version: number;
  };
  expect(project.name).toBe(name);
  expect(project.version).toBe(1);
  const graph = JSON.parse(
    await readFile(path.join(dir, "plan.graph.json"), "utf8"),
  ) as { nodes: unknown[]; edges: unknown[] };
  expect(graph.nodes).toEqual([{ id: "root", title: name }]);
  expect(graph.edges).toEqual([]);
  const progress = JSON.parse(
    await readFile(path.join(dir, "progress.json"), "utf8"),
  ) as { entries: { root: { status: string } } };
  expect(progress.entries.root.status).toBe("learning");
  expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
    `# ${name}\n\nStart your notes here.\n`,
  );
});

test("open does not write files into an empty directory", async ({ page }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-open-"));

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("status")).toContainText(
    "This folder is not a Linklike project yet",
  );
  await expect(page.getByRole("button", { name: "Open project" })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(readFile(path.join(dir, "project.json"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("a valid project still opens from the path field", async ({ page }) => {
  const dir = await copyMinimalProject();
  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await page.getByRole("button", { name: "Open project" }).click();
  await expectProjectView(page);
  await expect(page.locator(".topbar-title strong")).toHaveText("minimal");
});

test("initialize does not overwrite a corrupt project", async ({ page }) => {
  const dir = await copyMinimalProject();
  await corruptProjectJson(dir);
  const before = await readFile(path.join(dir, "project.json"), "utf8");

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Initialize" })).toHaveCount(0);
  expect(await readFile(path.join(dir, "project.json"), "utf8")).toBe(before);
});

test("browse sets the path and cancel leaves the field unchanged", async ({ page }) => {
  let reply: { cancelled: true } | { path: string } = { cancelled: true };
  await page.route("**/api/project/pick-directory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: reply,
    });
  });

  await page.goto("/");
  await page.locator("#path-input").fill("/tmp/keep-me");

  const cancelled = page.waitForResponse("**/api/project/pick-directory");
  await page.getByRole("button", { name: "Browse" }).click();
  await cancelled;
  await expect(page.locator("#path-input")).toHaveValue("/tmp/keep-me");

  reply = { path: "/tmp/picked-folder" };
  const picked = page.waitForResponse("**/api/project/pick-directory");
  await page.getByRole("button", { name: "Browse" }).click();
  await picked;
  await expect(page.locator("#path-input")).toHaveValue("/tmp/picked-folder");
});

test("initialize fails when the path does not exist", async ({ page }) => {
  const dir = path.join(tmpdir(), `linklike-e2e-missing-${Date.now()}`);

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("status")).toContainText("does not exist");
  await expect(page.getByRole("button", { name: "Initialize" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open project" })).toBeDisabled();
  await expect(readFile(path.join(dir, "project.json"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("initialize is allowed in a non-empty folder without JSON files", async ({
  page,
}) => {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-nonempty-"));
  await writeFile(path.join(dir, "readme.txt"), "keep me\n");

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("status")).toContainText(
    "This folder is not a Linklike project yet",
  );
  await page.getByRole("button", { name: "Initialize" }).click();
  await expectProjectView(page);
  expect(await readFile(path.join(dir, "readme.txt"), "utf8")).toBe("keep me\n");
});

test("initialize does not overwrite an existing root note", async ({ page }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-root-note-"));
  await mkdir(path.join(dir, "nodes"), { recursive: true });
  await writeFile(path.join(dir, "nodes", "root.mdx"), "KEEP THIS NOTE\n");

  await page.goto("/");
  await page.locator("#path-input").fill(dir);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Initialize" })).toHaveCount(0);
  expect(await readFile(path.join(dir, "nodes", "root.mdx"), "utf8")).toBe(
    "KEEP THIS NOTE\n",
  );
  await expect(readFile(path.join(dir, "project.json"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("browse success clears a previous open error", async ({ page }) => {
  await page.route("**/api/project/pick-directory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { path: "/tmp/picked-after-error" },
    });
  });

  const missing = path.join(tmpdir(), `linklike-e2e-browse-clear-${Date.now()}`);
  await page.goto("/");
  await page.locator("#path-input").fill(missing);
  await expect(page.getByRole("status")).toContainText("does not exist");

  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator("#path-input")).toHaveValue("/tmp/picked-after-error");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
