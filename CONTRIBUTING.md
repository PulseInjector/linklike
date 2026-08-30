# Contributing

## Quick links

- **GitHub:** https://github.com/PulseInjector/linklike

## How to contribute

Use the path that matches the kind of contribution you want to make:

1. **Bugs & small fixes** → Open a PR. If you need to file an issue first, use the [bug report template](https://github.com/PulseInjector/linklike/issues/new?template=bug_report.yml).
2. **New features or behavioral changes** → Start with a [feature request](https://github.com/PulseInjector/linklike/issues/new?template=feature_request.yml) before coding large work.
3. **Improvements tied to concrete work** → Use the [improvement template](https://github.com/PulseInjector/linklike/issues/new?template=improvement.yml) for focused refactors or quality improvements.
4. **Refactor-only PRs** → Do not open one unless a maintainer explicitly asked for it as part of a real fix.
5. **Questions** → Use [GitHub Discussions](https://github.com/PulseInjector/linklike/discussions). GitHub Issues are for actionable work.
6. **Security issues** → Follow [SECURITY.md](SECURITY.md); do not open a public issue.

### Environment setup

```bash
pnpm install
pnpm check
```

Run the dev server:

```bash
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173/`). Run only `pnpm dev` — do not copy shell comments on the same line.

CLI examples:

```bash
node packages/cli/bin/linklike.mjs init ~/learning/my-topic
node packages/cli/bin/linklike.mjs validate ~/learning/my-topic
```

### Contribution flow

1. **Find or create an issue** — Pick an existing one or raise a new one with the templates above.
2. **Branch** — `git checkout -b issue/123-short-description`
3. **Code and test** — Run `pnpm check` before you push. Comment style: [AGENTS.md § Comments](AGENTS.md#comments).
4. **Submit a PR** — Link the issue; use the pull request template.
5. **Review & iterate** — Address CI and review feedback until merge.
