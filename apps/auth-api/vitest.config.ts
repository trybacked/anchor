import { defineConfig } from "vitest/config";
import { appCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "auth-api",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: appCoverage,
  },
});
