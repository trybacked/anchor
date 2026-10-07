import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "ports-unit",
    include: ["tests/**/*.test.ts"],
  },
});
