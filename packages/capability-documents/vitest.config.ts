import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "capability-documents-unit",
    include: ["tests/**/*.test.ts"],
  },
});