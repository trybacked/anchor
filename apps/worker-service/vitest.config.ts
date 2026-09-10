import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "worker-service",
        include: ["tests/**/*.test.ts"],
        testTimeout: 60000,
        hookTimeout: 60000,
    },
});
