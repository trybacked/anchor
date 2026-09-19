import { defineConfig } from "vitest/config";
import { ingestGateCoverage } from "../../vitest.shared.js";

const INGEST_COVERAGE_FILES = [
  "src/model-search.ts",
  "src/materialize-facts.ts",
  "src/materialize-entity-profiles.ts",
  "src/object-query-reader.ts",
  "src/row-reader.ts",
  "src/aggregate-reader.ts",
  "src/apply-document-fields.ts",
];

export default defineConfig({
  test: {
    name: "ingest-unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      ...ingestGateCoverage,
      include: INGEST_COVERAGE_FILES,
    },
  },
});
