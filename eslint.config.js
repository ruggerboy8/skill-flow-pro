import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// GOV-4 lint gate: rule decisions and reasoning
// (full writeup in docs/dev/lint-policy.md)
//
// - ignores: added ".claude" because .claude/worktrees/ holds full checkouts
//   of this repo used by other agents. Without this, eslint was linting every
//   file in every abandoned worktree as if it were this repo's own source,
//   which is why the whole-repo problem count (2,909) was so much higher than
//   the real src/ count (693). Also ignoring any supabase/.temp directory the
//   Supabase CLI may generate locally; it isn't committed but is defensive.
// - @typescript-eslint/no-explicit-any: turned down to "warn". 587 of the 607
//   src/ errors (96%) were this one rule. Fixing them means writing real
//   types for Supabase query results, form payloads, etc, across the app.
//   That is a real engineering project, not a lint-config change, and mass-
//   editing that many call sites is explicitly out of scope for this ticket.
//   Warn keeps every instance visible in CI output without blocking merges.
// - @typescript-eslint/no-require-imports: turned down to "warn". The 3 hits
//   are require() calls loading tailwind plugins in tailwind.config.ts and
//   tailwind.config.backup.ts. Converting those to static imports touches
//   build config, not app code, and risks changing how PostCSS/Tailwind
//   resolves those plugins at build time, which is outside what this ticket
//   asked for. Left visible as a warning instead of silently fixed or ignored.
// - react-hooks/exhaustive-deps: left as "warn" (this is the plugin's own
//   recommended default, already in place before this ticket). The 65
//   warnings are real dependency-array gaps; fixing them can change when
//   effects re-run, i.e. real behavior change. That cleanup belongs in its
//   own ticket, done one effect at a time with testing, not as a lint-config
//   side effect.
// - react-refresh/only-export-components: left as "warn" (already the case
//   before this ticket). Many files intentionally co-export non-component
//   values (constants, helper functions) alongside a component, especially
//   in src/components/ui/*. Forcing every one of those into a separate file
//   is a structural change, not a lint fix, so it stays a visible warning.
// - Errors that were straightforward, local, and did not require design
//   decisions were fixed by hand instead of downgraded: two empty-interface
//   declarations (changed to `type X = Y` aliases, no behavior change), one
//   non-null assertion after an optional chain, and five expression
//   statements that used `cond ? a() : b()` or `cond && fn()` for side
//   effects only (rewritten as if/else or if statements, same runtime
//   behavior, now valid statements instead of unused expressions).
export default tseslint.config(
  { ignores: ["dist", ".claude", "supabase/.temp"] },
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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  }
);
