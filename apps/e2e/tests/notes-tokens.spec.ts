import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import tokens from "../../../design/notes/tokens.json" with { type: "json" };

const notesDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../design/notes",
);

test("notes tokens match the pinned review-document body rules", async ({ page }) => {
  const css = await readFile(path.join(notesDir, "tokens.css"), "utf8");
  await page.setContent(`<!doctype html>
<html>
  <head><style>${css}</style></head>
  <body>
    <article class="notes-document">
      <h1>Heading one</h1>
      <h2>Heading two</h2>
      <h3>Heading three</h3>
      <p>A paragraph of reading text.</p>
      <ul>
        <li>First</li>
        <li>Second</li>
      </ul>
      <p>See <a href="https://example.com">the link</a> and <code>inline</code>.</p>
      <pre><code>const sample = 1;</code></pre>
    </article>
  </body>
</html>`);

  const doc = page.locator(".notes-document");
  await expect(doc).toHaveCSS("font-size", tokens.document.fontSize);
  await expect(doc).toHaveCSS("line-height", tokens.document.lineHeightPx);
  await expect(doc).toHaveCSS("color", tokens.color.inkRgb);
  await expect(doc).toHaveCSS("background-color", tokens.color.backgroundRgb);
  await expect(doc).toHaveCSS("max-width", tokens.document.maxWidth);

  await expect(doc.locator("h1")).toHaveCSS("font-size", tokens.h1.fontSize);
  await expect(doc.locator("h1")).toHaveCSS("line-height", tokens.h1.lineHeight);
  await expect(doc.locator("h1")).toHaveCSS("font-weight", tokens.h1.fontWeight);

  await expect(doc.locator("h2")).toHaveCSS("font-size", tokens.h2.fontSize);
  await expect(doc.locator("h2")).toHaveCSS("line-height", tokens.h2.lineHeight);

  await expect(doc.locator("h3")).toHaveCSS("font-size", tokens.h3.fontSize);
  await expect(doc.locator("h3")).toHaveCSS("line-height", tokens.h3.lineHeight);

  await expect(doc.locator("p").first()).toHaveCSS(
    "font-size",
    tokens.paragraph.fontSize,
  );
  await expect(doc.locator("li").first()).toHaveCSS("font-size", tokens.list.fontSize);
  await expect(doc.locator("a")).toHaveCSS("color", tokens.color.linkRgb);
  await expect(doc.locator("p code")).toHaveCSS(
    "background-color",
    tokens.color.codeBackgroundRgb,
  );
  await expect(doc.locator("pre")).toHaveCSS(
    "background-color",
    tokens.color.preBackgroundRgb,
  );
  await expect(doc.locator("pre")).toHaveCSS("font-size", tokens.pre.fontSize);

  for (const name of ["h1", "h2", "paragraph", "list", "code"]) {
    await access(path.join(notesDir, "screenshots", `${name}.png`));
  }

  expect(tokens.source.selectors).toContain(".review-app--theme-light");
  expect(tokens.color.background).not.toBe("#0a0b0d");
  expect(tokens.color.ink).not.toBe("#e8eaee");
  const readme = await readFile(path.join(notesDir, "README.md"), "utf8");
  expect(readme).toContain(".review-app--theme-light");
});
