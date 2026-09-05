import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "semantic-unit",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
  },
});
