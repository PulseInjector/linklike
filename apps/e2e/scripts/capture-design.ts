import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const designDir = path.join(repoRoot, "design/learning-map");
const screenshotDir = path.join(designDir, "screenshots");
const tokensPath = path.join(designDir, "tokens.json");
const cssPath = path.join(designDir, "tokens.css");
const REFERENCE_URL = "https://roadmap.sh/data-engineer";

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const n =
    value.length === 3
      ? value
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : value;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHex(rgb) {
  const match = String(rgb)
    .trim()
    .match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const toHex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function luminance(hex) {
  const n = hex.replace("#", "");
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function withRgb(hex) {
  return { hex, rgb: hexToRgb(hex) };
}

function fontFamilyCss(family) {
  return family
    .split(",")
    .map((part) => {
      const trimmed = part.trim().replaceAll('"', "");
      return trimmed.includes(" ") ? `"${trimmed}"` : trimmed;
    })
    .join(", ");
}

function writeTokensCss(tokens) {
  return `:root {
  --bg: ${tokens.page.background};
  --panel: ${tokens.page.panel};
  --border: ${tokens.page.border};
  --text: ${tokens.page.text};
  --muted: ${tokens.page.muted};
  --accent: ${tokens.page.accent};
  --danger: ${tokens.page.danger};
  --map-dot: ${tokens.page.dot};
  --map-font-family: ${fontFamilyCss(tokens.font.family)};
  --map-font-size: ${tokens.font.size};
  --map-topic-bg: ${tokens.topic.background};
  --map-topic-color: ${tokens.topic.color};
  --map-topic-hover: ${tokens.topic.hover};
  --map-subtopic-bg: ${tokens.subtopic.background};
  --map-subtopic-color: ${tokens.subtopic.color};
  --map-subtopic-hover: ${tokens.subtopic.hover};
  --map-node-border: ${tokens.topic.border};
  --map-node-border-width: ${tokens.topic.borderWidth};
  --map-node-radius: ${tokens.topic.borderRadius};
  --map-node-padding: ${tokens.topic.padding};
  --map-section-bg: ${tokens.section.background};
  --map-section-border: ${tokens.section.border};
  --map-section-border-width: ${tokens.section.borderWidth};
  --map-section-radius: ${tokens.section.borderRadius};
  --map-selected-ring: ${tokens.selected.ring};
  --map-edge-stroke: ${tokens.edge.stroke};
  --map-edge-width: ${tokens.edge.strokeWidth}px;
  --map-edge-dashed: ${tokens.edge.dashedDasharray};
  --map-status-done-bg: ${tokens.progress.done.background};
  --map-status-done-color: ${tokens.progress.done.color};
  --map-status-learning-bg: ${tokens.progress.learning.background};
  --map-status-learning-color: ${tokens.progress.learning.color};
  --map-status-skip-bg: ${tokens.progress.skip.background};
  --map-status-skip-color: ${tokens.progress.skip.color};
}
`;
}

async function dismissChrome(page) {
  for (const name of ["Accept", "Accept All", "Accept all", "I agree", "Got it"]) {
    const button = page.getByRole("button", { name });
    if (
      await button
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await button
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
    }
  }
}

async function captureLive(page, tokens) {
  await page.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissChrome(page);
  await page.waitForTimeout(2000);

  const topic = page.locator("svg g[data-type='topic']").first();
  const subtopic = page.locator("svg g[data-type='subtopic']").first();
  const section = page.locator("svg g[data-type='section']").first();

  await topic.waitFor({ timeout: 45_000 });

  const readRect = async (locator) => {
    const rect = locator.locator("rect").first();
    if ((await rect.count()) === 0) {
      return null;
    }
    return rect.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        rx: style.rx || el.getAttribute("rx"),
      };
    });
  };

  const pageBg = await page.evaluate(() => {
    const topic = document.querySelector("svg g[data-type='topic']");
    const svg = topic?.closest("svg");
    let el = svg?.parentElement ?? document.querySelector("#resource-svg-wrap");
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        return bg;
      }
      el = el.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  });
  const topicRect = await readRect(topic);
  const subRect = await readRect(subtopic);
  const sectionRect = await readRect(section);
  const edge = page.locator("svg path, svg line").first();
  const edgeStroke = await edge
    .evaluate((el) => getComputedStyle(el).stroke)
    .catch(() => null);

  const applyFill = (target, fill, key) => {
    const hex = rgbToHex(fill);
    if (!hex) {
      return;
    }
    const rgb = withRgb(hex);
    target[key] = rgb.hex;
    target[`${key}Rgb`] = rgb.rgb;
  };

  if (pageBg) {
    const hex = rgbToHex(pageBg);
    // Ignore dark site chrome; the map canvas is white.
    if (hex && luminance(hex) >= 80) {
      tokens.page.background = hex;
      tokens.page.backgroundRgb = hexToRgb(hex);
    }
  }
  if (topicRect?.fill) {
    applyFill(tokens.topic, topicRect.fill, "background");
  }
  if (topicRect?.stroke) {
    applyFill(tokens.topic, topicRect.stroke, "border");
  }
  if (subRect?.fill) {
    applyFill(tokens.subtopic, subRect.fill, "background");
  }
  if (sectionRect?.fill && rgbToHex(sectionRect.fill)) {
    applyFill(tokens.section, sectionRect.fill, "background");
  }
  if (sectionRect?.stroke) {
    applyFill(tokens.section, sectionRect.stroke, "border");
  }
  if (edgeStroke) {
    const hex = rgbToHex(edgeStroke);
    if (hex && hex !== "#000000") {
      tokens.edge.stroke = hex;
      tokens.edge.strokeRgb = hexToRgb(hex);
    }
  }

  await topic.screenshot({ path: path.join(screenshotDir, "topic.png") });
  await subtopic.screenshot({ path: path.join(screenshotDir, "subtopic.png") });
  if ((await section.count()) > 0) {
    await section.screenshot({ path: path.join(screenshotDir, "section.png") });
  }

  return true;
}

async function captureSwatches(page, tokens) {
  const html = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 24px; background: ${tokens.page.background}; font-family: ${tokens.font.family}; }
      .row { display: flex; gap: 32px; align-items: flex-start; }
      .topic, .subtopic, .section {
        display: flex; align-items: center; justify-content: center;
        border: ${tokens.topic.borderWidth} solid ${tokens.topic.border};
        border-radius: ${tokens.topic.borderRadius};
        font-size: ${tokens.font.size};
        color: ${tokens.topic.color};
        padding: ${tokens.topic.padding};
      }
      .topic { background: ${tokens.topic.background}; width: 220px; height: 49px; }
      .subtopic { background: ${tokens.subtopic.background}; width: 260px; height: 49px; }
      .section {
        background: ${tokens.section.background};
        width: 280px; height: 160px;
        position: relative;
      }
      .section .subtopic { position: absolute; top: 24px; left: 20px; }
    </style>
  </head>
  <body>
    <div class="row">
      <div class="topic" id="topic">Introduction</div>
      <div class="subtopic" id="subtopic">What is Data Engineering?</div>
      <div class="section" id="section"><div class="subtopic">Python</div></div>
    </div>
  </body>
</html>`;
  await page.setContent(html);
  await page
    .locator("#topic")
    .screenshot({ path: path.join(screenshotDir, "topic.png") });
  await page.locator("#subtopic").screenshot({
    path: path.join(screenshotDir, "subtopic.png"),
  });
  await page
    .locator("#section")
    .screenshot({ path: path.join(screenshotDir, "section.png") });
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const { readFile } = await import("node:fs/promises");
  const tokens = JSON.parse(await readFile(tokensPath, "utf8"));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let live = false;
  try {
    live = await captureLive(page, tokens);
  } catch (error) {
    console.warn(`Live capture failed (${String(error)}). Using token swatches.`);
  }

  if (!live) {
    await captureSwatches(page, tokens);
  } else if (
    !(await import("node:fs/promises")
      .then((fs) => fs.access(path.join(screenshotDir, "section.png")))
      .then(() => true)
      .catch(() => false))
  ) {
    await captureSwatches(page, tokens);
  }

  tokens.source = {
    ...tokens.source,
    url: REFERENCE_URL,
    capturedAt: new Date().toISOString(),
    live,
  };

  await writeFile(tokensPath, `${JSON.stringify(tokens, null, 2)}\n`);
  await writeFile(cssPath, writeTokensCss(tokens));
  await browser.close();
  console.log(`Wrote ${path.relative(repoRoot, designDir)} (live=${live})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
