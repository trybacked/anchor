import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "diff-unit",
        include: ["tests/unit/**/*.test.ts"],
        passWithNoTests: true,
    },
});
