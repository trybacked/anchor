import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "runner",
        include: ["tests/**/*.test.ts"],
        passWithNoTests: true,
    },
});
