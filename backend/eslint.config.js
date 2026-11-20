
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Ignore generated Prisma client and compiled output.
    ignores: ["dist/**", "src/generated/**", "node_modules/**"],
  },

  // Enable recommended JavaScript rules.
  eslint.configs.recommended,

  // Enable recommended TypeScript rules.
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.ts"],

    rules: {
      // Prevent the use of explicit 'any'.
      "@typescript-eslint/no-explicit-any": "error",

      // Enforce unused-variable checks while allowing
      // intentionally unused parameters prefixed with "_".
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
