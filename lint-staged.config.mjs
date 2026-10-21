/** @type {import('lint-staged').Configuration} */
export default {
  "**/*.{js,cjs,mjs,ts}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "**/*.{json,md,mdx,yml,yaml}": "prettier --write",
};
