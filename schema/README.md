# Anchor protocol schema

Machine-readable JSON Schema for **`model.yaml`** (format version 1).

| File | Purpose |
|---|---|
| [`anchor-schema-v1.json`](./anchor-schema-v1.json) | Generated from `SemanticModelSchema` in `@backed/core` |
| [`../docs/MODEL-FORMAT-v1.md`](../docs/MODEL-FORMAT-v1.md) | Normative format specification (human-readable) |

Regenerate after schema changes:

```bash
pnpm build && pnpm generate:schema
```

CI fails if `anchor-schema-v1.json` is out of date.
