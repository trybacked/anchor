export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,

  endOfLine: "lf",
  overrides: [
    {
      files: ["*.md"],
      options: { proseWrap: "preserve" },
    },
  ],
};
