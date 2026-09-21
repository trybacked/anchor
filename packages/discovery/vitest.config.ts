import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "discovery-unit",
    include: ["tests/**/*.test.ts"],
  },
});
