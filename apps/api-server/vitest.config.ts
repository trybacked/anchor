import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "api-server-unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
