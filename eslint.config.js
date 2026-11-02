import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Quality gates (vibe-coding-toolkit, prompt 08). Ficheiros .cjs copiados sem alterações.
import quality from "./eslint-rules/index.cjs";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // Quality gates — medidos em 02/11/2026. Regras com violações ficam em "warn"
    // com a contagem de base; voltam a "error" quando chegarem a zero.
    // Não alteram o build (vite build não corre o ESLint).
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    ignores: ["src/integrations/supabase/types.ts", "src/routeTree.gen.ts"],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350 }], // base: 29 ficheiros acima de 350 linhas (02/11/2026)
      "quality/no-direct-console": ["warn", { logger: "um utilitário de log do projeto" }], // base: 59 (02/11/2026)
      "quality/no-direct-data-access": [
        "warn", // base: 55 (02/11/2026)
        {
          modules: ["@/integrations/supabase/client"],
          bindings: ["supabase"],
          layers: ["/src/routes/", "/src/components/"],
          extensions: [".tsx"],
        },
      ],
    },
  },
  {
    // O mesmo limite de linhas para testes, em "warn" (depois do bloco acima).
    files: ["tests/**/*.{ts,tsx}", "**/*{.,-}{test,spec}.{ts,tsx}"],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      // Copiados byte a byte do toolkit: não reformatar.
      "prettier/prettier": "off",
    },
  },
);
