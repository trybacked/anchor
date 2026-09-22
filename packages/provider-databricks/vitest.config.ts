import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "provider-databricks-unit",
    include: ["tests/**/*.test.ts"],
  },
});
