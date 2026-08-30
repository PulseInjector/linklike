import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const notesDir = path.join(repoRoot, "design/notes");
const screenshotDir = path.join(notesDir, "screenshots");
const cssPath = path.join(notesDir, "tokens.css");

function sampleHtml(css: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
${css}
body { margin: 0; background: #0a0b0d; }
.notes-document { padding: 32px 40px 48px; }
.notes-document h1, .notes-document h2, .notes-document p,
.notes-document ul, .notes-document pre { margin-inline: 0; width: auto; max-width: 720px; }
    </style>
  </head>
  <body>
    <article class="notes-document">
      <h1>Heading one</h1>
      <h2>Heading two</h2>
      <p>A paragraph of reading text used to clip measure, size, and line-height.</p>
      <ul>
        <li>First list item</li>
        <li>Second list item</li>
      </ul>
      <p>Inline <code>code</code> beside prose.</p>
      <pre><code>const sample = "block";</code></pre>
    </article>
  </body>
</html>`;
}

const clips = [
  { name: "h1", selector: "h1" },
  { name: "h2", selector: "h2" },
  { name: "paragraph", selector: "p" },
  { name: "list", selector: "ul" },
  { name: "code", selector: "pre" },
];

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const css = await readFile(cssPath, "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 880, height: 900 } });
  await page.setContent(sampleHtml(css), { waitUntil: "load" });

  for (const clip of clips) {
    const locator = page.locator(`.notes-document ${clip.selector}`).first();
    await locator.screenshot({ path: path.join(screenshotDir, `${clip.name}.png`) });
  }

  await browser.close();
}

await main();
