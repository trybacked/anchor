import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "semantic-chat-unit",
    include: ["tests/**/*.test.ts"],
  },
});
