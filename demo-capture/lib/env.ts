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
