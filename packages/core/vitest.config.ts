import { defineConfig } from "vitest/config";
import { coreCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "core-unit",
    include: ["tests/unit/**/*.test.ts", "tests/golden/**/*.test.ts"],
    coverage: coreCoverage,
  },
});
