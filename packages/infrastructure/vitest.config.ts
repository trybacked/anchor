import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "infrastructure-unit",
    include: ["tests/**/*.test.ts"],
  },
});
