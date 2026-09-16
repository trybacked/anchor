import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "anchor-sdk-unit",
        include: ["tests/unit/**/*.test.ts"],
        passWithNoTests: true,
    },
});
