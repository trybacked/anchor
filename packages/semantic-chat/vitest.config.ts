import { defineConfig } from "vitest/config";

const e2eEnabled = process.env["SEMANTIC_DOCUMENT_E2E"] === "1";

export default defineConfig({
  test: {
    name: "semantic-chat-unit",
    include: [
      "tests/unit/**/*.test.ts",
      ...(e2eEnabled ? (["tests/e2e/**/*.e2e.test.ts"] as const) : []),
    ],
  },
});
