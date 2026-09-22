import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "runtime-unit",
    include: ["tests/**/*.test.ts"],
  },
});
