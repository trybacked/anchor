# @backed/cli

Local-first **`backed`** command-line interface. Orchestration only — domain logic lives in `@backed/runner` and `@trybacked/core`.

User-facing copy is English. Errors exit with code `1`.

---

## Documentation

| Resource                                            | Contents                    |
| --------------------------------------------------- | --------------------------- |
| [Operations guide](../../docs/OPERATIONS.md)        | Full workspace workflow     |
| [Governance](../../docs/GOVERNANCE.md)              | validate, publish, rollback |
| [Providers](../../docs/PROVIDERS.md)                | DuckDB and Databricks       |
| [CLI index](../../docs/README.md#cli-command-index) | All commands                |

---

## Quick start

```bash
cd your-workspace
mkdir -p sources
backed init
backed model          # requires AI_GATEWAY_API_KEY in .env
backed review
backed validate
backed serve
```

Global install from monorepo: `pnpm build && cd apps/cli && pnpm link --global`.

---

## Commands

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `init`             | Interactive `.backed/config.yaml`                      |
| `model`            | Ingest → profile → proposal                            |
| `inspect`          | Dataset catalog (`--databricks`)                       |
| `discover`         | Deterministic discovery (`--snapshot`, `--databricks`) |
| `review`           | Steward review → workspace ontology                    |
| `validate`         | Schema and ontology checks                             |
| `publish`          | Publication registry (`--status`)                      |
| `rollback`         | Restore prior publication                              |
| `diff`             | Run or ontology diff (`--ontology`)                    |
| `serve`            | MCP over the agreed ontology                           |
| `gateway`          | AI Gateway key                                         |
| `login` / `logout` | Optional telemetry auth                                |

See `backed <command> --help` for flags.
