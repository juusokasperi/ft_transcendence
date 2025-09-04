/** @type {import('prettier').Config} */
module.exports = {
  // base defaults (JS/TS/TSX/etc.)
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: "all",
  arrowParens: "always",

  overrides: [
    // --- Markdown ---
    {
      files: ["**/*.md", "**/*.mdx"],
      options: {
        printWidth: 80, // narrower for prose
        proseWrap: "preserve", // keep manual wraps; use 'always' if you prefer reflow
      },
    },

    // --- YAML ---
    {
      files: ["**/*.yml", "**/*.yaml"],
      options: {
        // YAML uses its own quoting rules; singleQuote doesn’t apply
        tabWidth: 2,
        // no other special options usually needed
      },
    },

    // --- JSON / JSONC / JSON5 ---
    // Prettier already enforces valid JSON (no trailing commas),
    // but these make parsing explicit and let you tweak width if you want.
    {
      files: ["**/*.json"],
      options: {
        parser: "json",
        printWidth: 100,
      },
    },
    {
      files: ["**/*.json5"],
      options: {
        parser: "json5",
        printWidth: 100,
      },
    },
    {
      files: ["**/*.jsonc"],
      options: {
        parser: "jsonc",
        printWidth: 100,
      },
    },
  ],
};
