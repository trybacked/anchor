import { MODEL_FORMAT_VERSION, SemanticModelSchema, type SemanticModel } from "@trybacked/core";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { runPublishOntologyJob } from "../../src/jobs/publish-ontology.js";

function entity(id: string, name: string, extraOrdersProperty = false): unknown {
  return {
    id,
    name,
    sourceTable: id,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table: id, evidence: "profile", method: "profile" },
    properties: [
      {
        name: "id",
        columnName: "id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 0.9,
        provenance: { table: id, evidence: "profile", method: "profile" },
      },
      ...(id === "orders"
        ? [
            {
              name: "customer",
              columnName: "customer_id",
              semanticType: "identifier",
              role: "foreign_key",
              nullable: true,
              confidence: 0.9,
              provenance: { table: id, evidence: "profile", method: "profile" },
            },
            ...(extraOrdersProperty
              ? [
                  {
                    name: "note",
                    columnName: "note",
                    semanticType: "text",
                    role: "attribute",
                    nullable: true,
                    confidence: 0.9,
                    provenance: { table: id, evidence: "profile", method: "profile" },
                  },
                ]
              : []),
          ]
        : []),
    ],
  };
}

function buildModel(runId: string, extraOrdersProperty: boolean): SemanticModel {
  return SemanticModelSchema.parse({
    metadata: {
      formatVersion: MODEL_FORMAT_VERSION,
      runId,
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    entities: [entity("orders", "Orders", extraOrdersProperty), entity("customers", "Customers")],
    relations: [
      {
        id: "orders_customers",
        name: "Orders to customers",
        fromEntity: "orders",
        toEntity: "customers",
        fromColumn: "customer_id",
        toColumn: "id",
        cardinality: "many_to_one",
        status: "confirmed",
        confidence: 0.9,
        provenance: {
          table: "orders",
          column: "customer_id",
          evidence: "foreign key",
          method: "profile",
        },
      },
    ],
    rules: [],
  });
}

type RecordedQuery = { text: string; values: unknown[] };

function poolMock(
  handlers: ((sql: string) => { rows: unknown[] } | undefined)[],
  log: RecordedQuery[],
): pg.Pool {
  return {
    query: async (text: unknown, values?: unknown[]) => {
      const sql = typeof text === "string" ? text : String((text as { text?: string }).text ?? "");
      log.push({ text: sql, values: values ?? [] });
      for (const handler of handlers) {
        const handled = handler(sql);
        if (handled !== undefined) {
          return handled;
        }
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

function draftHandler(model: unknown) {
  return (sql: string) =>
    sql.includes("FROM ontology_drafts")
      ? {
          rows: [
            {
              tenant_id: "gerace",
              revision: 5,
              model,
              based_on_version: 3,
              updated_by: "luca",
              updated_at: new Date(),
            },
          ],
        }
      : undefined;
}

function latestVersionHandler(version: number | null) {
  return (sql: string) => (sql.includes("MAX(version)") ? { rows: [{ version }] } : undefined);
}

function versionRow(version: number, model: unknown) {
  return {
    tenant_id: "gerace",
    version,
    model,
    ontology: {},
    published_by: "luca",
    published_at: new Date(),
    notes: null,
    artifact_path: null,
  };
}

function ontologyVersionHandler(rows: unknown[]) {
  return (sql: string) => (sql.includes("FROM ontology_versions WHERE") ? { rows } : undefined);
}

function configFor(root: string) {
  return {
    host: "localhost",
    port: 8080,
    databaseUrl: "postgres://localhost/test",
    adminToken: "a".repeat(16),
    internalToken: "b".repeat(16),
    filesRoot: root,
    filesRegistryRoot: root,
    sharedSpacesJson: "{}",
    defaultSharedSpaces: [],
  };
}

const dirs: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "publish-provenance-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const input = { tenantId: "gerace", catalog: "backed_gerace", actor: "luca" };

function storedRecord(root: string): {
  provenance?: {
    publishedBy: string;
    method: string;
    derivedFromVersion?: number;
    draftRevision?: number;
    modelSha256: string;
    changeSummary?: Record<string, number>;
  };
  modelYaml: string;
} {
  return JSON.parse(
    readFileSync(path.join(root, input.catalog, "backed", "registry", "current.json"), "utf-8"),
  );
}

function firstValues(log: RecordedQuery[], marker: string): unknown[] {
  const entry = log.find((item) => item.text.includes(marker));
  if (entry === undefined) {
    throw new Error(`expected query containing "${marker}"`);
  }
  return entry.values;
}

describe("runPublishOntologyJob provenance", () => {
  it("publishes with a model hash and a change summary diffed from the previous version", async () => {
    const root = tempRoot();
    const log: RecordedQuery[] = [];
    const draftModel = buildModel("run-2", true);
    const previousModel = buildModel("run-1", false);
    const pool = poolMock(
      [
        draftHandler(draftModel),
        latestVersionHandler(3),
        ontologyVersionHandler([versionRow(3, previousModel)]),
      ],
      log,
    );
    const result = await runPublishOntologyJob(pool, configFor(root), input);
    expect(result.version).toBe(4);

    const record = storedRecord(root);
    expect(record.provenance?.publishedBy).toBe("luca");
    expect(record.provenance?.method).toBe("publish");
    expect(record.provenance?.derivedFromVersion).toBe(3);
    expect(record.provenance?.draftRevision).toBe(5);
    expect(record.provenance?.modelSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.provenance?.changeSummary).toEqual({ added: 1 });

    const auditValues = firstValues(log, "INSERT INTO ontology_changes");
    const auditEvent = JSON.parse(auditValues[3] as string);
    expect(auditEvent.action).toBe("publish");
    expect(auditEvent.runId).toBe("run-2");
  });

  it("records method rollback with the restored version as derivedFromVersion", async () => {
    const root = tempRoot();
    const log: RecordedQuery[] = [];
    const draftModel = buildModel("run-3", false);
    const pool = poolMock(
      [draftHandler(draftModel), latestVersionHandler(7), ontologyVersionHandler([])],
      log,
    );
    const result = await runPublishOntologyJob(pool, configFor(root), {
      ...input,
      method: "rollback",
      derivedFromVersion: 3,
    });
    expect(result.version).toBe(8);

    const record = storedRecord(root);
    expect(record.provenance?.method).toBe("rollback");
    expect(record.provenance?.derivedFromVersion).toBe(3);
    expect(record.provenance?.modelSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.provenance?.changeSummary).toBeUndefined();

    const auditValues = firstValues(log, "INSERT INTO ontology_changes");
    const auditEvent = JSON.parse(auditValues[3] as string);
    expect(auditEvent.action).toBe("rollback");
  });
});
