import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
    rules: {
      // Express recognises an error handler by its 4 arguments, so `next` must stay; a leading _ opts out too
      "no-unused-vars": ["error", { args: "after-used", ignoreRestSiblings: true, argsIgnorePattern: "^_|^next$", varsIgnorePattern: "^_" }],
    },
  },
];
