import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "runner",
    include: ["tests/**/*.test.ts"],
    coverage: packageCoverage,
  },
});
