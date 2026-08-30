# Notes reading tokens

Typography for note preview, taken from the public
[devdotfast/review](https://github.com/devdotfast/review) document styles.

Pinned source (only):

- Repo: https://github.com/devdotfast/review
- Commit: `ad457e726d04e3f92e1f751bd4bb9ab28c5d514a`
- File: `packages/progressive-review/app/src/styles.css`
- Selectors: `.review-document` and the body rules for h1–h3, p, li, code/pre, measure, and font stack

Playwright imports these files. Keep this directory separate from
`design/learning-map/`.

## Files

- `tokens.json` — source of truth for sizes, measure, colors, and e2e
- `tokens.css` — CSS variables and `.notes-document` rules
- `screenshots/` — clipped h1, h2, paragraph, list, and code rendered with these tokens

## Rerun

From the repository root:

```bash
pnpm capture:notes
```
