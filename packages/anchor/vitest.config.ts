import { defineConfig } from "vitest/config";
import { anchorCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "anchor-sdk-unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      ...anchorCoverage,
      exclude: ["src/generated/**", "src/webhook/index.ts"],
    },
  },
});
