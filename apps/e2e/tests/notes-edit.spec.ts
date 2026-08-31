import { expect, test } from "@playwright/test";

import tokens from "../../../design/notes/tokens.json" with { type: "json" };
import {
  copyNotesProject,
  readNodeMarkdown,
  writeNodeMarkdown,
} from "../helpers/project.js";
import { openNodeDrawer, openProject } from "../helpers/ui.js";

const UPDATED = `# Saved heading

Edited in the drawer.

- Alpha
- Beta

\`code\`
`;

test("saving the drawer writes the note and matches the next open", async ({
  page,
}) => {
  const projectDir = await copyNotesProject();
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Only node");

  const editor = page.locator("#note-markdown");
  const preview = page.locator(".drawer .notes-document");
  await expect(preview.locator("h1")).toHaveText("Heading one");
  await expect(preview.locator("p")).toContainText("A paragraph of reading text.");
  await expect(preview.locator("li").first()).toHaveText("First");
  await expect(preview.locator("pre")).toContainText("const sample = 1;");

  await editor.fill(UPDATED);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(await readNodeMarkdown(projectDir, "root")).toBe(UPDATED);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".drawer")).toHaveCount(0);
  await openNodeDrawer(page, "Only node");
  await expect(page.locator("#note-markdown")).toHaveValue(UPDATED);
  await expect(page.locator(".drawer .notes-document")).toContainText(
    "Edited in the drawer.",
  );
});

test("empty note body is allowed on save", async ({ page }) => {
  const projectDir = await copyNotesProject();
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Only node");

  await page.locator("#note-markdown").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(await readNodeMarkdown(projectDir, "root")).toBe("");
});

test("a failed write keeps the previous body on disk", async ({ page }) => {
  const projectDir = await copyNotesProject();
  const original = await readNodeMarkdown(projectDir, "root");
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Only node");

  await page.route("**/api/project/nodes/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "disk write failed" }),
      });
      return;
    }
    await route.continue();
  });

  await page.locator("#note-markdown").fill("# Should not land\n");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("disk write failed");
  expect(await readNodeMarkdown(projectDir, "root")).toBe(original);

  await page.getByRole("button", { name: "Close" }).click();
  await openNodeDrawer(page, "Only node");
  await expect(page.locator("#note-markdown")).toHaveValue(original);
});

test("preview uses notes reading tokens from the token files", async ({ page }) => {
  const projectDir = await copyNotesProject();
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Only node");

  const preview = page.locator(".drawer .notes-document");
  const ink = await preview.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--notes-ink").trim(),
  );
  expect(ink).toBe(tokens.color.ink);
  await expect(preview).toHaveCSS("font-size", tokens.document.fontSize);
  await expect(preview).toHaveCSS("line-height", tokens.document.lineHeightPx);
  await expect(preview).toHaveCSS("color", tokens.color.inkRgb);
  await expect(preview).toHaveCSS("background-color", tokens.color.backgroundRgb);
  await expect(preview.locator("h1")).toHaveCSS("font-size", tokens.h1.fontSize);
  await expect(preview.locator("h1")).toHaveCSS("line-height", tokens.h1.lineHeight);
  await expect(preview.locator("p").first()).toHaveCSS(
    "font-size",
    tokens.paragraph.fontSize,
  );
  await expect(preview.locator("li").first()).toHaveCSS(
    "font-size",
    tokens.list.fontSize,
  );
  await expect(preview.locator("pre")).toHaveCSS("font-size", tokens.pre.fontSize);
});

test("script tags in a note do not run as JavaScript", async ({ page }) => {
  const projectDir = await copyNotesProject();
  await writeNodeMarkdown(
    projectDir,
    "root",
    `# Safe

<script>window.__linklikeNotesPwned = true</script>
`,
  );
  await openProject(page, projectDir);
  await openNodeDrawer(page, "Only node");

  await expect(page.locator(".drawer .notes-document script")).toHaveCount(0);
  expect(await page.evaluate("window.__linklikeNotesPwned")).toBeUndefined();
});
