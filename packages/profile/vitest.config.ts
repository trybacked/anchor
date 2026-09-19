import { defineConfig } from "vitest/config";
import { profileGateCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "profile-unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      ...profileGateCoverage,
      include: ["src/patterns.ts"],
    },
  },
});
