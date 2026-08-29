# Linklike — agent notes

Editable project files (user learning directories):

- `project.json`
- `plan.graph.json`
- `progress.json`
- `nodes/<nodeId>.mdx`

After changes, run:

```bash
pnpm check
```

Or from a user project directory:

```bash
linklike validate --json .
```

Do not add narrative comments to source code. Do not commit planning drafts under `docs/`.
