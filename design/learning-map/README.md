# Learning map design system

Visual values for the read-only map, taken from the public
[Data Engineer](https://roadmap.sh/data-engineer) map on roadmap.sh.

`apps/web` and Playwright import these files. Do not copy hex values into
tickets or components.

## Files

- `tokens.json` — source of truth for layout, e2e, and CSS
- `tokens.css` — CSS variables imported by `App.css`
- `screenshots/` — clipped topic, subtopic, and section from the reference page

## Rerun

From the repository root (network required):

```bash
pnpm capture:design
pnpm sync:reference-map
```

`pnpm capture:design` opens the reference page, reads computed styles, and
updates tokens plus PNGs. `pnpm sync:reference-map` rebuilds
`fixtures/reference-map` from `https://roadmap.sh/data-engineer.json`.

`pnpm validate` still targets `fixtures/minimal-project` only. Confirm the
sample fixture with:

```bash
node packages/cli/bin/linklike.mjs validate fixtures/reference-map
```
