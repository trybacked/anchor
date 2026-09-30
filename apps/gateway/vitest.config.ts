import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "gateway-unit",
    include: ["tests/unit/**/*.test.ts"],
  },
});
