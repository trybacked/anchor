import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        name: "cli-e2e",
        include: ["tests/e2e/**/*.test.ts"],
        testTimeout: 60000,
        hookTimeout: 60000,
    },
});
