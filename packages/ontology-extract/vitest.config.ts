import { defineConfig } from "vitest/config";

const e2eEnabled = process.env["ONTOLOGY_EXTRACT_E2E"] === "1";

export default defineConfig({
  test: {
    name: "ontology-extract-unit",
    include: [
      "tests/unit/**/*.test.ts",
      ...(e2eEnabled ? (["tests/e2e/**/*.e2e.test.ts"] as const) : []),
    ],
  },
});
