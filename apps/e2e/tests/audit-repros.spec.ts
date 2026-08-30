import { expect, test } from "@playwright/test";

import {
  copyMinimalProject,
  copyTwoNodeProject,
  setProjectName,
} from "../helpers/project.js";
import { expectProjectView, mapNode, openProject, STATUS_BG } from "../helpers/ui.js";

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

// Audit-panel blocker reproduction map (tmp/reviews SHORT_SHA 05-repro-map.md)
// A: manual CLI / DevTools Offline
// B: this file
// C: scripts/graph-progress-race.ts

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

    await mapNode(page, "Minimal example").click();
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

    await mapNode(page, "Second topic").click();
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
});
