import { optionalEnv } from "../demo-capture/lib/env.ts";
import type { Persona } from "../demo-capture/config.ts";

/**
 * Which seeded persona this harness's one spec logs in as. Centralized here
 * (rather than duplicated in both e2e/setup/global-setup.ts and the spec
 * itself) so "which persona gets signed in" and "which persona's
 * storageState the test loads" can't drift apart.
 *
 * Defaults to "admin" -- the spec needs a login whose sidebar shows an
 * "Admin" link. Override with PRF3A_LOGIN=<staff|coach|admin> if a
 * different seeded persona is known to carry those flags (see the spec's
 * ACCESS NOTE).
 */
export const PERSONA = optionalEnv(process.env, "PRF3A_LOGIN", "admin") as Persona;
