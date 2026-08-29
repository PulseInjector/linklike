# Linklike

Local-first learning map that grows with you. Open the graph in your browser, keep notes on disk, use the CLI for agents.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints in the terminal (usually `http://localhost:5173/`).

Run only `pnpm dev` — do not copy shell comments on the same line.

## CLI

```bash
pnpm --filter @linklike/cli exec linklike init ~/learning/my-topic
pnpm --filter @linklike/cli exec linklike validate ~/learning/my-topic
```

## Checks

```bash
pnpm check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
