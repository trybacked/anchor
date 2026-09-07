import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "profile-unit",
        include: ["tests/unit/**/*.test.ts"],
        passWithNoTests: true,
    },
});
