import { expect, type Page } from "@playwright/test";

import tokens from "../../../design/learning-map/tokens.json" with { type: "json" };

export async function openProject(page: Page, projectDir: string): Promise<void> {
  await page.goto("/");
  await page.locator("#path-input").fill(projectDir);
  await page.getByRole("button", { name: "Open project" }).click();
  await page.getByRole("button", { name: "Reload" }).waitFor();
}

export async function openProjectFromUrl(
  page: Page,
  projectDir: string,
): Promise<void> {
  await page.goto(`/?path=${encodeURIComponent(projectDir)}`);
  await page.getByRole("button", { name: "Reload" }).waitFor();
}

export async function expectProjectView(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
}

export function mapNode(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(".map-node").filter({ hasText: new RegExp(`^${escaped}$`) });
}

export async function selectMapNode(page: Page, title: string): Promise<void> {
  await mapNode(page, title).click();
}

export async function clickEmptyMapCanvas(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) {
      return null;
    }
    const rect = pane.getBoundingClientRect();
    const blocked = [
      ...document.querySelectorAll(
        ".map-node, .map-node-toolbar, .map-node-title-input, .react-flow__controls",
      ),
    ].map((node) => node.getBoundingClientRect());
    for (let y = rect.top + 8; y < rect.bottom - 8; y += 8) {
      for (let x = rect.left + 8; x < rect.right - 8; x += 8) {
        const hit = blocked.some(
          (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
        );
        if (!hit) {
          return { x, y };
        }
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

export async function openNodeDrawer(page: Page, title: string): Promise<void> {
  await mapNode(page, title).dblclick();
  await expect(page.locator(".drawer h2")).toHaveText(title);
}

export const STATUS_BG = {
  learning: tokens.progress.learning.backgroundRgb,
  done: tokens.progress.done.backgroundRgb,
  skip: tokens.progress.skip.backgroundRgb,
} as const;
