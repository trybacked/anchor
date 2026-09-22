import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "compiler-unit",
    include: ["tests/**/*.test.ts"],
  },
});
