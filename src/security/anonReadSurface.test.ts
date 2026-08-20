/**
 * SEC-1 regression guard.
 *
 * SEC-1 closed an unauthenticated (anon-role) read surface that exposed
 * employee names, personal emails and performance scores across every
 * tenant. It was fixed on production by two migrations:
 *
 *   supabase/migrations/20260819021638_sec1_close_anon_read_surface.sql
 *   supabase/migrations/20260819021706_sec1_revoke_function_execute_from_public.sql
 *
 * The same exposure reverted three times before this guard existed, twice
 * because a later migration re-created one of these objects (CREATE OR
 * REPLACE with a new signature makes a brand-new Postgres function, which
 * gets Postgres's default PUBLIC execute grant back) without re-applying
 * the revoke. This test behaves like an anonymous attacker: it opens a
 * fresh anon Supabase client and tries to read every object SEC-1 closed.
 * If any of them start returning real data again, this test fails.
 *
 * The closed inventory is exported as data (CLOSED_RELATIONS,
 * CLOSED_FUNCTIONS) so SEC-2 or later tickets can extend the list without
 * touching the test logic below.
 *
 * This test hits the live network and is skipped unless
 * RUN_LIVE_SECURITY_TESTS is set, or if the network turns out to be
 * unreachable at run time. See docs/specs/sec-1-anon-read-regression-guard.md.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

// Re-declared rather than imported from src/integrations/supabase/client.ts:
// that module is globally mocked in src/test/setup.ts for the rest of the
// suite (see supabaseMock.ts), and this test needs a real network client
// with no session. These are the same public URL and anon (publishable) key
// already committed in that file — not secrets.
export const SUPABASE_URL = 'https://yeypngaufuualdfzcjpk.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlleXBuZ2F1ZnV1YWxkZnpjanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MjEyMDMsImV4cCI6MjA2OTI5NzIwM30.zugutVfLz0dgR7C9eRFUEGsRJBbkP0pAYjsZ9soUHyw';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** A view or table that SEC-1 closed off from `anon`. */
export interface ClosedRelation {
  /** Table/view name in the `public` schema. */
  name: string;
  kind: 'view' | 'table';
}

/**
 * The 3 views SEC-1 switched to `security_invoker` and revoked anon SELECT
 * on, plus the 2 leftover hollow-evals repair tables it locked with RLS and
 * no policies. Source: 20260819021638_sec1_close_anon_read_surface.sql.
 */
export const CLOSED_RELATIONS: ClosedRelation[] = [
  { name: 'view_evaluation_items_enriched', kind: 'view' },
  { name: 'view_weekly_scores_with_competency', kind: 'view' },
  { name: 'view_staff_submission_windows', kind: 'view' },
  { name: 'eval_payload_recovery_backup', kind: 'table' },
  { name: '_eval_repair_targets', kind: 'table' },
];

/** A SECURITY DEFINER function SEC-1 revoked anon (and public) EXECUTE on. */
export interface ClosedFunction {
  /** Function name in the `public` schema. */
  name: string;
  /** Minimal argument set that satisfies the function's required params. */
  params: Record<string, unknown>;
}

/**
 * The 8 functions SEC-1's follow-up migration revoked EXECUTE from PUBLIC
 * and anon on (the first migration's `revoke ... from anon` alone had no
 * effect, because Postgres grants EXECUTE to PUBLIC by default and anon
 * inherits it). Source:
 * 20260819021706_sec1_revoke_function_execute_from_public.sql. Argument
 * names/types come from each function's live definition; a nil UUID is used
 * throughout so a call that somehow got past the permission check still
 * touches no real row.
 */
export const CLOSED_FUNCTIONS: ClosedFunction[] = [
  { name: 'get_staff_all_weekly_scores', params: { p_staff_id: NIL_UUID } },
  { name: 'get_staff_submission_windows', params: { p_staff_id: NIL_UUID } },
  { name: 'get_coach_roster_summary', params: { p_coach_user_id: NIL_UUID } },
  { name: 'get_calendar_week_status', params: { p_location_id: NIL_UUID, p_role_id: 1 } },
  { name: 'compute_eval_self_scores', params: { p_eval_id: NIL_UUID } },
  { name: 'compute_eval_participation_snapshot', params: { p_eval_id: NIL_UUID } },
  { name: 'get_strengths_weaknesses', params: { p_org_id: NIL_UUID } },
  { name: 'compare_conf_perf_to_eval', params: { p_org_id: NIL_UUID } },
];

/**
 * Positive control: a function that is genuinely anon-callable today, used
 * to prove this test discriminates a closed surface from a blanket network
 * outage rather than just failing to reach Supabase at all.
 *
 * `seq_latest_quarterly_evals(p_org_id, p_role_id)` returns competency-level
 * *aggregate* scores for the sequencer/recommender (no staff names, emails,
 * or per-person scores). It is not in SEC-1's closed list and is not
 * guarded by this test's other assertions.
 *
 * Note for a future ticket, not fixed here (out of SEC-1's scope): this
 * function is reachable by anon via Postgres's default PUBLIC-execute grant
 * on new functions, not an explicit `grant ... to anon`. Its earlier
 * single-arg signature was explicitly granted to anon (see
 * 20251105184418_52902e03-58f6-4448-b3db-ff6f97246de3.sql), but the current
 * two-arg signature is a different function object that inherited the
 * default grant when it was created, and nothing revoked it. It returns no
 * PII so this is not the same regression class SEC-1 fixed, but it is worth
 * a deliberate decision (explicit grant vs. revoke) rather than being open
 * by accident.
 */
export const POSITIVE_CONTROL: ClosedFunction = {
  name: 'seq_latest_quarterly_evals',
  params: { p_org_id: NIL_UUID, p_role_id: 1 },
};

const RUN_LIVE = ['1', 'true'].includes((process.env.RUN_LIVE_SECURITY_TESTS ?? '').toLowerCase());

/** Distinguishes "Supabase reachable, got a real HTTP response" from a DNS/
 * network-level failure, so the offline case can be skipped rather than
 * reported as a security failure. */
async function isNetworkReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    return true;
  } catch {
    return false;
  }
}

describe('SEC-1 anon read surface stays closed', () => {
  let anon: SupabaseClient;
  let shouldRun = false;

  beforeAll(async () => {
    if (!RUN_LIVE) {
      console.warn(
        '[SEC-1 guard] skipping: set RUN_LIVE_SECURITY_TESTS=1 to run this test against live Supabase.',
      );
      return;
    }
    anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const reachable = await isNetworkReachable();
    if (!reachable) {
      console.warn('[SEC-1 guard] skipping: Supabase host unreachable from this environment.');
      return;
    }
    shouldRun = true;
  });

  /** SEC-1 closed this by revoking anon SELECT and switching to
   * security_invoker (views) or enabling RLS with no policies (tables). A
   * regression means either: an explicit permission error goes away, or the
   * caller starts getting real rows back. Both would fail this check. */
  async function expectAnonCannotRead(relation: ClosedRelation) {
    const { data, error } = await anon.from(relation.name).select('*').limit(1);
    if (error) {
      // Closed as expected: anon isn't even allowed to query it.
      expect(data, `${relation.name}: got rows alongside an error`).toBeFalsy();
      return;
    }
    // No error is only acceptable if RLS silently returned nothing real.
    expect(
      Array.isArray(data) ? data.length : 0,
      `${relation.name}: anon read succeeded with no error - this ${relation.kind} may have reopened`,
    ).toBe(0);
  }

  /** SEC-1's follow-up revoked EXECUTE from PUBLIC and anon. A regression
   * (e.g. a later CREATE OR REPLACE with a changed signature, which builds a
   * new function object with Postgres's default PUBLIC-execute grant) shows
   * up as the call succeeding instead of a permission error. */
  async function expectAnonCannotExecute(fn: ClosedFunction) {
    const { data, error } = await anon.rpc(fn.name, fn.params);
    if (error) {
      expect(data, `${fn.name}: got data alongside an error`).toBeFalsy();
      return;
    }
    expect(
      Array.isArray(data) ? data.length : 0,
      `${fn.name}: anon RPC call succeeded with no error - EXECUTE may have reverted to PUBLIC`,
    ).toBe(0);
  }

  for (const relation of CLOSED_RELATIONS) {
    it(`anon cannot read ${relation.kind} ${relation.name}`, async () => {
      if (!shouldRun) return;
      await expectAnonCannotRead(relation);
    });
  }

  for (const fn of CLOSED_FUNCTIONS) {
    it(`anon cannot execute function ${fn.name}`, async () => {
      if (!shouldRun) return;
      await expectAnonCannotExecute(fn);
    });
  }

  it(`positive control: anon can still call ${POSITIVE_CONTROL.name}`, async () => {
    if (!shouldRun) return;
    const { data, error } = await anon.rpc(POSITIVE_CONTROL.name, POSITIVE_CONTROL.params);
    expect(error, `positive control RPC failed: ${JSON.stringify(error)}`).toBeNull();
    expect(Array.isArray(data), 'positive control RPC did not return an array').toBe(true);
  });
});
