import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "profile-unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: packageCoverage,
  },
});
