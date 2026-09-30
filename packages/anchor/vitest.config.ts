import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "anchor-unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
