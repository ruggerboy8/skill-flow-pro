/**
 * Pure env-lookup helpers, extracted out of config.ts so they're testable
 * without a browser or Playwright — each function takes the env object
 * explicitly instead of reading `process.env` itself.
 */

export type Persona = "staff" | "coach" | "admin";

export interface PersonaCreds {
  email: string;
  password: string;
}

export type EnvLike = Record<string, string | undefined>;

export class MissingEnvError extends Error {}

export function requireEnv(env: EnvLike, name: string): string {
  const value = env[name];
  if (!value) {
    throw new MissingEnvError(
      `${name} is not set. Copy demo-capture/.env.example to demo-capture/.env ` +
        `and fill it in, or export ${name} in your shell. See demo-capture/README.md.`
    );
  }
  return value;
}

export function optionalEnv(env: EnvLike, name: string, fallback: string): string {
  const value = env[name];
  return value && value.length > 0 ? value : fallback;
}

/**
 * Credentials for one login persona. The email defaults to the fixed demo
 * cast address DEMO-1a's seed always creates (scripts/demo-seed/cast.ts),
 * overridable per persona; the password has no default and is required —
 * there's no safe fallback for a real login secret.
 */
export function credsFor(env: EnvLike, persona: Persona): PersonaCreds {
  const upper = persona.toUpperCase();
  return {
    email: optionalEnv(env, `DEMO_${upper}_EMAIL`, `demo-${persona}@bluebird.demo`),
    password: requireEnv(env, `DEMO_${upper}_PASSWORD`),
  };
}

export interface ResetGateSkip {
  shouldRun: false;
  reason: string;
}
export interface ResetGateRun {
  shouldRun: true;
  url: string;
  serviceRoleKey: string;
}
export type ResetGateResult = ResetGateSkip | ResetGateRun;

/**
 * Decides whether setup/reset-clip1.ts should attempt a live reset at all,
 * without doing any I/O itself -- kept pure and separate so this decision
 * (opt-out flag, missing credentials) is unit-testable without a database.
 */
export function resetClip1Gate(env: EnvLike): ResetGateResult {
  if (env.DEMO_CLIP1_AUTO_RESET === "false") {
    return { shouldRun: false, reason: "DEMO_CLIP1_AUTO_RESET=false" };
  }

  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return {
      shouldRun: false,
      reason:
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, so Clip 1 was not " +
        "automatically reset. If the \"Rate Confidence\" CTA is missing on this " +
        "run, either set both vars in demo-capture/.env (see .env.example) to " +
        "let this run automatically next time, or run " +
        "`npx tsx scripts/demo-seed/seed.ts --refresh` (DEMO-1a) before recording again.",
    };
  }

  return { shouldRun: true, url, serviceRoleKey };
}
