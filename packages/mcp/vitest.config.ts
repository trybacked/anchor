import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "mcp-unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: packageCoverage,
  },
});
