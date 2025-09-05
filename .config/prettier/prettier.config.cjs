/** @type {import('prettier').Config} */
module.exports = {
  // base defaults (JS/TS/TSX/etc.)
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: "all",
  arrowParens: "always",
  endOfLine: "lf",
  useTabs: false,
  tabWidth: 2,

  overrides: [
    // --- Markdown ---
    {
      files: ["**/*.md", "**/*.mdx"],
      options: {
        printWidth: 80, // narrower for prose
        proseWrap: "preserve", // keep manual wraps; use 'always' if you prefer reflow
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
  plugins: [
    'prettier-plugin-tailwindcss',
  ],
  tailwindStylesheet: './client/src/index.css',
};
