/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  // Pin line endings: `pnpm format:check` is a CI gate, and a contributor with
  // core.autocrlf enabled would otherwise fail it on every file.
  endOfLine: "lf",
  overrides: [
    {
      // Documentation is hand-tuned prose and tables; reflowing it creates
      // noisy diffs and breaks alignment.
      files: ["*.md"],
      options: { proseWrap: "preserve" },
    },
  ],
};
