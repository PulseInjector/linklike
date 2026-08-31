import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  copyMinimalProject,
  copyTwoNodeProject,
  corruptProjectJson,
  readGraphFile,
  setProjectName,
} from "../helpers/project.js";
import {
  expectProjectView,
  mapNode,
  openNodeDrawer,
  openProject,
  selectMapNode,
  STATUS_BG,
} from "../helpers/ui.js";

const SLOW_GET_MS = 2000;

function delayGetForPath(projectDir: string, delayMs: number) {
  return async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = decodeURIComponent(route.request().url());
    if (url.includes(projectDir)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  };
}

function delayNextProjectGet(delayMs: number) {
  let delay = true;
  return async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (delay) {
      delay = false;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  };
}

async function submitProjectPath(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("form").evaluate((form) => {
    form.requestSubmit();
  });
}

// Classification map — tmp/reviews/11dcc35/05-repro-map.md
// A F2: CLI dangling symlink — probe uninitialized, init ProjectExists
// B F1: this file — delayed probe for URL path overwrites draft empty folder
// B F3: this file — GET /project 500 after init when ?path already set
// 不复现: #25 vs root.mdx; canOpen/invalid retry; App.tsx structure; ponytail
// Previous ba93fc4: A F1–F2,F4,F6–F9; B double-Enter add; D F5 OpeningView

test.describe("audit reproducers (timing / network only)", () => {
  test("stale GET /project overwrites UI after faster path switch", async ({
    page,
  }) => {
    const slowDir = await copyMinimalProject();
    const fastDir = await copyTwoNodeProject();
    await setProjectName(slowDir, "Slow Project");
    await setProjectName(fastDir, "Fast Project");

    await page.route("**/api/project?path=*", delayGetForPath(slowDir, SLOW_GET_MS));

    await page.goto("/");
    await page.locator("#path-input").fill(slowDir);
    await page.getByRole("button", { name: "Open project" }).click();

    await page.locator("#path-input").fill(fastDir);
    await submitProjectPath(page);

    await expectProjectView(page);
    await expect(page.locator(".topbar-path")).toHaveText(fastDir);
    await expect(page.locator(".topbar-title strong")).toHaveText("Fast Project");

    await page.waitForTimeout(SLOW_GET_MS + 500);
    await expect(page.locator(".topbar-path")).toHaveText(fastDir);
    await expect(page.locator(".topbar-title strong")).toHaveText("Fast Project");
  });

  test("open another during slow reload does not resurrect project view", async ({
    page,
  }) => {
    const projectDir = await copyMinimalProject();
    await openProject(page, projectDir);

    await page.route("**/api/project?path=*", delayNextProjectGet(SLOW_GET_MS));

    await page.getByRole("button", { name: "Reload" }).click();
    await page.getByRole("button", { name: "Open another" }).click();

    await expect(page.locator("#path-input")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).not.toBeVisible();

    await page.waitForTimeout(SLOW_GET_MS + 500);
    await expect(page.locator("#path-input")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).not.toBeVisible();
  });

  test("reload with stale progress does not revert concurrent PATCH", async ({
    page,
  }) => {
    const projectDir = await copyTwoNodeProject();
    await openProject(page, projectDir);

    await openNodeDrawer(page, "Minimal example");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(mapNode(page, "Minimal example")).toHaveCSS(
      "background-color",
      STATUS_BG.done,
    );

    await page.route("**/api/project?path=*", delayNextProjectGet(SLOW_GET_MS));

    const reloadRequest = page.waitForRequest(
      (req) => req.method() === "GET" && req.url().includes("/api/project"),
    );
    await page.getByRole("button", { name: "Reload" }).click();
    await reloadRequest;

    await openNodeDrawer(page, "Second topic");
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(mapNode(page, "Second topic")).toHaveCSS(
      "background-color",
      STATUS_BG.skip,
    );

    await page.waitForTimeout(SLOW_GET_MS + 500);
    await expect(mapNode(page, "Minimal example")).toHaveCSS(
      "background-color",
      STATUS_BG.done,
    );
    await expect(mapNode(page, "Second topic")).toHaveCSS(
      "background-color",
      STATUS_BG.skip,
    );
  });

  test("reload failure keeps the project view", async ({ page }) => {
    const projectDir = await copyMinimalProject();
    await openProject(page, projectDir);

    await page.route("**/api/project?path=*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ tag: "IoError", error: "offline" }),
      });
    });

    await page.getByRole("button", { name: "Reload" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(page.locator("#path-input")).toHaveCount(0);
  });

  test("stale URL probe does not switch an empty draft to Open", async ({ page }) => {
    const invalidDir = await copyMinimalProject();
    await corruptProjectJson(invalidDir);
    const emptyDir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-stale-probe-"));

    await page.route(
      "**/api/project/probe?path=*",
      delayGetForPath(invalidDir, SLOW_GET_MS),
    );

    await page.goto(`/?path=${encodeURIComponent(invalidDir)}`);
    await page.locator("#path-input").fill(emptyDir);

    await page.waitForTimeout(SLOW_GET_MS + 500);

    await expect(page.getByRole("button", { name: "Initialize" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open project" })).toBeDisabled();
    await expect(
      readFile(path.join(emptyDir, "project.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("init then failed load does not keep Initialize", async ({ page }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "linklike-e2e-init-loadfail-"));

    await page.route("**/api/project?path=*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ tag: "IoError", error: "offline" }),
      });
    });

    await page.goto(`/?path=${encodeURIComponent(dir)}`);
    await expect(page.getByRole("status")).toContainText(
      "This folder is not a Linklike project yet",
    );
    await page.getByRole("button", { name: "Initialize" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Initialize" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open project" })).toBeEnabled();
  });

  test("F3: slow POST add does not create two nodes from double Enter", async ({
    page,
  }) => {
    await page.route("**/api/project/nodes", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, SLOW_GET_MS));
      await route.continue();
    });

    const projectDir = await copyTwoNodeProject();
    await openProject(page, projectDir);

    await selectMapNode(page, "Minimal example");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("New node title").fill("Race child");
    await page.getByLabel("New node title").press("Enter");
    await page.getByLabel("New node title").press("Enter");

    await expect(page.getByTestId("rf__node-race-child")).toBeVisible({
      timeout: 15_000,
    });
    await expect(mapNode(page, "Race child")).toHaveCount(1);
    const graph = await readGraphFile(projectDir);
    expect(graph.nodes.filter((node) => node.title === "Race child")).toHaveLength(1);
  });
});
