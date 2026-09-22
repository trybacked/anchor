import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "registry-unit",
    include: ["tests/**/*.test.ts"],
  },
});
