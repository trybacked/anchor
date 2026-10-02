# @trybacked/anchor

HTTP client for the Backed gateway and platform API.

## Install

```json
"@trybacked/anchor": "workspace:*"
```

## Gateway (browser / workshop)

```ts
import { createBackedClient } from "@trybacked/anchor";

const backed = createBackedClient({
  mode: "gateway",
  baseUrl: "https://api.example.com",
  credentials: "include",
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

await backed.auth.loginWithPassword({ username: "demo", password: "…" });
const session = await backed.auth.session();

const gerace = backed.tenant("gerace");
const { entities } = await gerace.model.listEntities();
await gerace.files.upload(file, { filename: "report.pdf", folder: "contratti" });
const run = await gerace.files.refresh();
await gerace.ai.ask({ question: "How many contracts?", evidence: true });
```

WorkOS: redirect with `location.href = backed.auth.loginUrl({ next: "/app" })`.

## Platform API (server-side)

```ts
const backed = createBackedClient({
  mode: "platform",
  baseUrl: "http://127.0.0.1:8787",
  token: process.env.ANCHOR_API_TOKEN!,
});

const tenant = backed.tenant("gerace");
await tenant.query.objects({ objectId: "contract", mode: "count" });
```

## Modules

| Module                  | Methods                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `auth` (gateway only)   | `loginWithPassword`, `loginUrl`, `logout`, `me`, `session`              |
| `health` (gateway only) | `live`, `status`                                                        |
| `tenant(id).model`      | `listEntities`, `getEntity`, `listRelations`, `search`, `getDefinition` |
| `tenant(id).query`      | `objects`                                                               |
| `tenant(id).search`     | `entities`, `chunks`                                                    |
| `tenant(id).documents`  | `get`, `preview`, `previewUrl`                                          |
| `tenant(id).graph`      | `profile`, `traverse`                                                   |
| `tenant(id).ai`         | `ask`                                                                   |
| `tenant(id).files`      | `upload`, `list`, `delete`, `refresh`, `getRefresh`, `waitForRefresh`   |
| `tenant(id).authoring.ontology` | `getDraft`, `apply`, `applyPack`, `validate`, `diff`, `publish`, `versions`, `rollback`, `import`, `export`, `packs`, `changes` |
| `tenant(id).authoring.warehouse` | `schemas`, `tables`, `columns` |
| `tenant(id).authoring.datasets` | `list`, `create` |
| `tenant(id).authoring.members` | `list`, `set`, `remove` |
| `tenant(id).authoring.jobs` | `get`, `wait` |

Authoring routes: `{gateway}/t/{tenant}/v1/authoring/...` (requires control plane + roles). See [docs/ONTOLOGY-AUTHORING.md](../../../docs/ONTOLOGY-AUTHORING.md).

Types are re-exported from `@trybacked/service` and `@trybacked/core` (gateway contract).

## Legacy

`createAnchorClient({ baseUrl: "…/t/gerace" })` remains as a thin compatibility wrapper; prefer `createBackedClient`.
