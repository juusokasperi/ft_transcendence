// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import unicorn from "eslint-plugin-unicorn";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  // Ignore build artifacts and generated files — no need to lint them
  { ignores: ["dist/**", "node_modules/**", "docs/**", "*.d.ts"] },

  // Base recommended rules for plain JavaScript
  js.configs.recommended,

  // Lighter TypeScript rules (not the "strict type-checked" set, which is noisy)
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    plugins: { unicorn, security, sonarjs },
    languageOptions: {
      parserOptions: {
        // We don’t force a full type-aware config (no "project") to avoid performance issues
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use injected rng" },
        {
          object: "Date",
          property: "now",
          message: "Do not time-seed game logic",
        },
      ],
      // --- Imports ---
      // Discourage parent-relative imports ("../") to keep imports clean and maintainable
      // But only warn (not error), so it doesn’t block you when refactoring.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["^\\.{2}(/|$)"],
              message:
                "Prefer path aliases (@shared, @game, @client, ...) instead of parent-relative imports.",
            },
          ],
        },
      ],

      // --- Naming conventions ---
      // Enforce kebab-case filenames (consistent across OSes and build tools)
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          ignore: [
            String.raw`\.d\.ts$`, // declaration files
            String.raw`\.spec\.ts$`, // test files
            String.raw`\.test\.ts$`,
          ],
        },
      ],

      // Enforce PascalCase for types, and mixed cases for exported consts
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "variable",
          modifiers: ["const", "exported"],
          format: ["UPPER_CASE", "camelCase", "PascalCase"],
        },
      ],

      // --- Unicorn rules (sane defaults without too much noise) ---
      "unicorn/prefer-node-protocol": "warn", // Prefer `node:path` imports
      "unicorn/no-useless-undefined": "warn", // Avoid `= undefined`
      "unicorn/no-abusive-eslint-disable": "error", // Don’t allow silent disables
      "unicorn/prevent-abbreviations": "off", // Too strict for game code (props, fx, etc. are fine)

      // --- Security rules (basic protection, not too strict) ---
      "security/detect-eval-with-expression": "warn",
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-regexp": "warn",

      // --- SonarJS rules (catch performance/code smell issues) ---
      "sonarjs/no-all-duplicated-branches": "warn",
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-nested-switch": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/cognitive-complexity": ["warn", 15], // Soft cap on function complexity

      // --- Noise reduction ---
      "no-console": "off", // Allowed for debugging; can be restricted later in production
      "no-unused-vars": "off", // TS handles this better
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      eqeqeq: ["warn", "smart"], // Encourage ===, allow == null for null/undefined checks

      // Formatting is handled by Prettier — no ESLint style rules here
    },
  },

  // --- Tests ---
  // In test files, we relax import rules and filename casing (test helpers often break patterns)
  {
    files: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
    rules: {
      "no-restricted-imports": "off",
      "unicorn/filename-case": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // Always keep Prettier last, to disable conflicting rules
  eslintConfigPrettier,
];
