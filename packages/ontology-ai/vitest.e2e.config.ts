import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ontology-ai-e2e",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
  },
});
