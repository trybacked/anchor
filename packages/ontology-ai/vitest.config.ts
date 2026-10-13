import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "ontology-ai-unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
