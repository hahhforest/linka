/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  ignorePatterns: ["dist/", "node_modules/", ".turbo/"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
};
