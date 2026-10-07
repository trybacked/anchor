import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "ontology-extract-unit",
    include: ["tests/**/*.test.ts", "tests/e2e/**/*.e2e.test.ts"],
  },
});
