import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "provider-duckdb-unit",
    include: ["tests/**/*.test.ts"],
  },
});
