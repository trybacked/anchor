import { defineConfig } from "vitest/config";
import { appCoverage } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    name: "worker-service",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: appCoverage,
  },
});
