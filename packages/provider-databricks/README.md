# @trybacked/provider-databricks

Enterprise **Databricks SQL warehouse** adapter implementing Anchor’s `DatasetProvider` contract.

---

## Configuration

Workspace `.env`:

```bash
BACKED_DATABRICKS_HOST=dbc-xxxxxxxx.cloud.databricks.com
BACKED_DATABRICKS_TOKEN=dapixxxxxxxx
BACKED_DATABRICKS_WAREHOUSE_ID=xxxxxxxx
BACKED_DATABRICKS_CATALOG=main      # optional
BACKED_DATABRICKS_SCHEMA=sales      # optional
```

---

## CLI

```bash
backed inspect --databricks
backed discover --databricks
```

Uses the [SQL Statement Execution API](https://docs.databricks.com/api/workspace/statementexecution) (no JDBC driver in the CLI path).

---

## Programmatic

```typescript
import { createDatabricksProviderFromEnv } from "@trybacked/provider-databricks";
import { discoverFromDatasetProvider } from "@trybacked/discovery";

const { provider } = createDatabricksProviderFromEnv();
const report = await discoverFromDatasetProvider(provider, { ontologyId: "my-workspace" });
```
