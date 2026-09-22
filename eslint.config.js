import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

const packageSrc = (name) => [`${name}/src/**/*.ts`];
const publicPackages = ["packages/core"];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "**/src/generated/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: [["builtin", "external"], "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
        },
      ],
    },
  },
  {
    files: ["apps/**/src/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["packages/**/src/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  ...publicPackages.flatMap((pkg) => [
    {
      files: packageSrc(pkg),
      plugins: { jsdoc },
      settings: {
        jsdoc: {
          mode: "typescript",
        },
      },
      rules: {
        "jsdoc/require-jsdoc": [
          "warn",
          {
            publicOnly: { esm: true },
            require: {
              FunctionDeclaration: true,
              MethodDefinition: true,
              ClassDeclaration: true,
            },
            contexts: [
              "ExportNamedDeclaration > FunctionDeclaration",
              "ExportNamedDeclaration > TSInterfaceDeclaration",
              "ExportNamedDeclaration > TSTypeAliasDeclaration",
              "ExportDefaultDeclaration > ClassDeclaration",
            ],
          },
        ],
        "jsdoc/require-param-description": "off",
        "jsdoc/require-returns-description": "off",
        "jsdoc/require-description": "off",
        "jsdoc/check-tag-names": "warn",
      },
    },
  ]),
  {
    files: ["**/*.test.ts"],
    rules: {
      "no-console": "off",
      "jsdoc/require-jsdoc": "off",
    },
  },
);
