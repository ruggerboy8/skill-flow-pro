/**
 * DEMO-1b: shared config for the capture harness.
 *
 * Every value that identifies the demo org, its logins, or where the app is
 * running comes from environment variables (optionally loaded from
 * demo-capture/.env — see .env.example), never hardcoded. This matters
 * because the demo org (DEMO-1a) does not exist yet at the time this harness
 * is built: nothing here can point at a real id.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { credsFor as credsForEnv, optionalEnv as optionalEnvOf, type Persona, type PersonaCreds } from "./lib/env.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Load demo-capture/.env if present. Never throws if it's missing — env vars
// may instead be exported directly in the shell (e.g. in CI).
const localEnvPath = path.join(HERE, ".env");
if (existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

export type { Persona, PersonaCreds };

// Thin wrappers around the pure, unit-tested helpers in lib/env.ts, bound to
// the real process.env so callers elsewhere in this harness don't have to
// thread it through themselves.
function optionalEnv(name: string, fallback: string): string {
  return optionalEnvOf(process.env, name, fallback);
}

/** Where the app under capture is running. Defaults to the local Vite dev server port. */
export const BASE_URL = optionalEnv("DEMO_CAPTURE_BASE_URL", "http://localhost:8080");

/** Run headed (visible browser) instead of headless. Useful for the DEMO-1c dry run. */
export const HEADED = optionalEnv("DEMO_CAPTURE_HEADED", "false") === "true";

/** Retake budget: how many times Playwright retries a failed clip before giving up. */
export const RETRIES = Number(optionalEnv("DEMO_CAPTURE_RETRIES", "2"));

/** Directory storageState JSON files are written to / read from. Gitignored: these are live sessions. */
export const AUTH_DIR = path.join(HERE, ".auth");

/** Directory Playwright writes recorded video into. Gitignored: this is the raw footage. */
export const OUTPUT_DIR = path.join(HERE, "recordings");

export function storageStatePath(persona: Persona): string {
  return path.join(AUTH_DIR, `${persona}.json`);
}

/**
 * Credentials for each login persona. Emails default to the fixed demo cast
 * addresses DEMO-1a's seed always creates (scripts/demo-seed/cast.ts), but
 * can be overridden per DEMO-1c's "not hardcoded" requirement — e.g. if the
 * demo org is ever reseeded under a different email domain. The actual
 * lookup logic is in lib/env.ts (unit tested there); this just binds it to
 * process.env.
 */
export function credsFor(persona: Persona): PersonaCreds {
  return credsForEnv(process.env, persona);
}

/**
 * Which login persona records which clip. Spec-documented defaults below,
 * but every one is a one-line env override — no code change needed — for
 * the DEMO-1c dry run if the seeded demo org's role flags don't line up
 * with what the spec assumed (see README "Persona / access notes").
 */
export const CLIP_PERSONAS = {
  staffSelfEval: optionalEnv("DEMO_CLIP1_LOGIN", "staff") as Persona,
  coachFacilitation: optionalEnv("DEMO_CLIP2_LOGIN", "coach") as Persona,
  groupDomainConfidence: optionalEnv("DEMO_CLIP3_LOGIN", "coach") as Persona,
  evaluationGlowsGrows: optionalEnv("DEMO_CLIP4_LOGIN", "coach") as Persona,
  regionalCommandCenter: optionalEnv("DEMO_CLIP5_LOGIN", "admin") as Persona,
};

/**
 * Canned observation text typed into the evaluation capture textarea for
 * Clip 4, standing in for a live spoken observation. See README "Clip 4 and
 * the microphone" for why this spec types instead of recording audio.
 */
export const CLIP4_FEEDBACK_TEXT = optionalEnv(
  "DEMO_CLIP4_FEEDBACK_TEXT",
  "During the visit I watched them walk the guardian through the treatment " +
    "plan before starting, checking in twice to make sure everything landed. " +
    "They kept eye contact with the kiddo the whole time and narrated every " +
    "step out loud, but rushed the post-op instructions at the end and didn't " +
    "confirm the guardian had them written down."
);

/**
 * Which staff member's row Clip 4 opens on the coach dashboard. The
 * dashboard's default row order is sort-by-submission-status, not "who owns
 * the seeded draft evaluation" -- so Clip 4 searches for this identity by
 * name/email (src/pages/coach/CoachDashboardV2.tsx's own "Search by name or
 * email..." filter) instead of taking the first row. Defaults to the
 * demo-staff login's email: a natural, already-known identity for DEMO-1c
 * to attach the fabricated draft evaluation to. Override with
 * DEMO_CLIP4_STAFF_SEARCH if the real draft evaluation ends up on a
 * different cast member.
 */
export const CLIP4_STAFF_SEARCH = optionalEnv(
  "DEMO_CLIP4_STAFF_SEARCH",
  optionalEnv("DEMO_STAFF_EMAIL", "demo-staff@bluebird.demo")
);

/**
 * Supabase project connection for the optional, gated Clip 1 auto-reset
 * (see setup/reset-clip1.ts). Same var names scripts/demo-seed/.env.example
 * uses, so one .env can serve both tools. No default: an empty value means
 * "not configured," which the reset helper treats as "skip, don't fail."
 */
export const SUPABASE_URL = optionalEnv("SUPABASE_URL", "");
export const SUPABASE_SERVICE_ROLE_KEY = optionalEnv("SUPABASE_SERVICE_ROLE_KEY", "");
