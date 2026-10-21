import { fileURLToPath } from "node:url";

import babelParser from "@babel/eslint-parser";

import { baseConfig } from "./base.js";

const typescriptPresetPath = fileURLToPath(import.meta.resolve("@babel/preset-typescript"));

/** @type {import('eslint').Linter.Config[]} */
export const nestJsConfig = [
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [typescriptPresetPath],
          parserOpts: { plugins: ["decorators-legacy"] },
        },
      },
    },
    rules: {
      // TypeScript checks names in both type and value positions.
      "no-undef": "off",
    },
  },
];
