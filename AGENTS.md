# Linklike — agent notes

## Repository map

| Path                        | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `packages/protocol/`        | Zod schemas for project, graph, and progress         |
| `packages/core/`            | Read/write and validate learning project directories |
| `packages/cli/`             | `linklike` CLI                                       |
| `apps/api/`                 | Local HTTP API (Hono) for the browser UI             |
| `apps/e2e/`                 | Playwright e2e and race reproduction scripts         |
| `apps/web/`                 | Browser UI (Vite + React)                            |
| `fixtures/minimal-project/` | Golden project; must pass `pnpm validate`            |
| `.github/`                  | CI, issue templates, pull request template           |
| `CONTRIBUTING.md`           | Contribution workflow; which issue template to use   |

## CI (mandatory)

Do not treat "pushed a fix" or "opened a PR" as done until checks pass.

1. Run `pnpm check` locally before every push.
2. On pull requests, watch GitHub Actions until the `check` job is green.
3. Fix root causes; do not disable checks to merge.

## Issues and pull requests

When creating GitHub issues, use the forms in `.github/ISSUE_TEMPLATE/` and follow [CONTRIBUTING.md](CONTRIBUTING.md).

- Bugs → `bug_report.yml` (`[BUG]` title prefix)
- Features → `feature_request.yml` (`[FEATURE]`)
- Improvements → `improvement.yml` (`[IMPROVEMENT]`)

Do not invent ad-hoc issue formats. Do not commit planning drafts under `docs/`.

Open pull requests for changes to this repository; do not push directly to `main`.

## User learning projects (on disk)

Editable files in a user's learning directory:

- `project.json`
- `plan.graph.json`
- `progress.json`
- `nodes/<nodeId>.mdx`

After changes to protocol or fixtures, run:

```bash
pnpm check
```

From a user project directory:

```bash
linklike validate --json .
```

Grow the map from the terminal (validates before writing, creates the node stub):

```bash
linklike node add . --title "Pod basics" --parent root
```

## Code style

- Match existing formatting; `pnpm format:check` must pass.
- Run `pnpm lint:comments` before push; it is part of `pnpm check`.

## Comments

- **Why, not what:** Names, types, and tests show what happens. Comments explain non-obvious invariants, failure modes, layering boundaries, concurrency, or version/security pins that the code cannot express.
- **Keep it short:** Prefer one `//` line beside the constraint. TypeScript rarely needs file-level blocks; use them only when a module defines a public contract callers must understand.
- **Do not comment:** audit/PR narratives, bug history, or lines that restate the code. Put that in commits, PR descriptions, or test names (`test("…")`).
- **Do not remove** meaningful rationale just to minimize line count.
- **Tool directives** (`// @ts-expect-error`, `// eslint-disable-next-line`, `// prettier-ignore`) are allowed with a short reason after the directive.
- **Enforcement:** `pnpm lint:comments` forbids `/* */` block comments under `apps/` and `packages/`. `//` why-comments are allowed when they add real context; review catches narration that restates the code.

## Effect (`@linklike/core`)

Domain I/O lives in `@linklike/core` as `Effect` programs with tagged errors (`LinklikeError`).

- Do not `throw` in `packages/core/`; fail with `Data.TaggedError` classes from `errors.ts`.
- Do not use `instanceof Error` to branch on core failures; use `_tag` or `isLinklikeError`.
- `Effect.runPromise` belongs at boundaries only (`packages/cli/`, `apps/api/`). Do not add `effect` to `apps/web/`.
- `validateProjectDir` returns `ValidationResult` on the success channel (collect all issues). Mutations fail with `InvalidProject` when the tree is invalid.
- New error tags need `linklikeErrorMessage`, API mapping in `apps/api/src/app.ts`, and CLI handling in `packages/cli/src/bin.ts`.
