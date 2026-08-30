import type { Page } from "@playwright/test";

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

export function mapNode(page: Page, title: string) {
  return page.locator(".react-flow__node").filter({ hasText: title });
}

export const STATUS_BG = {
  learning: "rgb(133, 77, 14)",
  done: "rgb(22, 101, 52)",
  skip: "rgb(51, 65, 85)",
} as const;
