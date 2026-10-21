export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Commit prose follows the repository's no-hard-wrap convention.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
