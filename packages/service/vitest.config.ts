import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "service-unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
