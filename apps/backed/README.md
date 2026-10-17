# @trybacked/backed

Single npm install for the **Backed** platform CLI.

```bash
npm install -g @trybacked/backed
# or: pnpm add -g @trybacked/backed
```

Then:

```bash
backed anchor run      # ontology document pipeline (Node)
backed falcon record   # UI capture pipeline (Python Falcon)
backed --help
```

## What you get

| Command           | Runtime                                              | Notes                                                       |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `backed anchor …` | Node (`@trybacked/cli`)                              | Requires `AI_GATEWAY_API_KEY` for AI stages                 |
| `backed falcon …` | Python [Falcon](https://github.com/trybacked/falcon) | Install Falcon separately or use monorepo sibling `falcon/` |

This package is a thin wrapper around `@trybacked/cli` (same router, one binary name).

## Falcon setup

1. **Monorepo dev** — clone `falcon` next to `anchor` under `backed/`; install [uv](https://docs.astral.sh/uv/). The CLI runs `uv run --directory …/falcon falcon`.
2. **Global** — `pip install` / `uv tool install` Falcon so `falcon` is on `PATH`.
3. **Explicit** — set `FALCON_BIN` or `BACKED_FALCON_BIN` to the Python CLI executable (required if another program named `falcon` is on `PATH`, e.g. unrelated macOS binaries).

`backed falcon` / `backed falcon --help` print help from the Node CLI (no subprocess). Subcommands (`record`, `distill`, …) delegate to the Python Falcon via `uv run` when `falcon/` is a sibling of your cwd tree.

## Workspace development

From the Anchor repo:

```bash
pnpm install
pnpm --filter @trybacked/cli build
pnpm --filter @trybacked/backed exec backed --help
```
