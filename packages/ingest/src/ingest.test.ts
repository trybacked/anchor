import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestFolder } from "./index.js";
import type { IngestSession, IngestWarning } from "./index.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../fixtures/pmi-minimal", import.meta.url),
);

function warningsFor(session: IngestSession, file: string): IngestWarning[] {
  return session.warnings.filter((warning) => warning.file === file);
}

describe("ingestFolder on pmi-minimal", () => {
  let session: IngestSession;

  beforeAll(async () => {
    session = await ingestFolder(FIXTURE_PATH);
  });

  afterAll(() => {
    session.close();
  });

  it("registers every supported file as a queryable view", async () => {
    expect(session.datasets.map((dataset) => dataset.tableName)).toEqual([
      "clienti",
      "fatture",
      "prodotti",
    ]);

    const rows = await session.query(
      "SELECT SUM(importo) AS totale FROM fatture",
    );
    expect(Number(rows[0]?.["totale"])).toBeCloseTo(11083.09);
  });

  it("detects the Italian CSV dialect of fatture.csv", () => {
    const fatture = session.datasets.find(
      (dataset) => dataset.tableName === "fatture",
    );
    expect(fatture?.csvDialect).toEqual({
      delimiter: ";",
      encoding: "utf-8",
      decimalSeparator: ",",
    });

    const kinds = warningsFor(session, "fatture.csv").map((w) => w.kind);
    expect(kinds).toContain("semicolon_delimiter");
    expect(kinds).toContain("decimal_comma");
  });

  it("reads Windows-1252 clienti.csv as latin-1 with a warning", async () => {
    const clienti = session.datasets.find(
      (dataset) => dataset.tableName === "clienti",
    );
    expect(clienti?.csvDialect?.encoding).toBe("latin-1");

    const kinds = warningsFor(session, "clienti.csv").map((w) => w.kind);
    expect(kinds).toContain("non_utf8_encoding");

    const rows = await session.query(
      "SELECT citta FROM clienti WHERE id = 1",
    );
    expect(rows[0]?.["citta"]).toBe("Forlì");
  });
});

describe("ingestFolder on pathological folders", () => {
  let folder: string;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "backed-ingest-"));
    await writeFile(join(folder, "rotto.parquet"), "non sono un parquet");
    await writeFile(join(folder, "note.txt"), "appunti sparsi");
    await writeFile(
      join(folder, "valido.csv"),
      "codice,nome\nA1,Alfa\nB2,Beta\n",
    );
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("reports unreadable and unsupported files without failing the run", async () => {
    const session = await ingestFolder(folder);
    try {
      expect(session.datasets.map((dataset) => dataset.tableName)).toEqual([
        "valido",
      ]);

      const kinds = session.warnings.map((warning) => [
        warning.kind,
        warning.file,
      ]);
      expect(kinds).toContainEqual(["unreadable_file", "rotto.parquet"]);
      expect(kinds).toContainEqual(["unsupported_format", "note.txt"]);
    } finally {
      session.close();
    }
  });

  it("returns an empty result for an empty folder", async () => {
    const empty = await mkdtemp(join(tmpdir(), "backed-empty-"));
    const session = await ingestFolder(empty);
    try {
      expect(session.datasets).toEqual([]);
      expect(session.warnings).toEqual([]);
    } finally {
      session.close();
      await rm(empty, { recursive: true, force: true });
    }
  });
});
