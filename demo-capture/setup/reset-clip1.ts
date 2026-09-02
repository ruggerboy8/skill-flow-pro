/**
 * DEMO-1b: Clip 1 reset helper.
 *
 * Clip 1 (staff self-eval) submits a real confidence score, which
 * permanently completes demo-staff's current-week assignment. Recording it
 * twice -- a manual retake, or a Playwright `retries` re-run firing after
 * the submit already landed -- then finds no "Rate Confidence" CTA and
 * fails the very first assertion instead of recording anything.
 *
 * This clears just the current week's confidence fields for demo-staff, by
 * staff email, undoing exactly what Clip 1 itself just did. The three
 * columns it nulls (confidence_score, confidence_date, confidence_late) and
 * the staff_id + week_of filter shape are copied directly from DEMO-1a's
 * own live `--refresh` reset (scripts/demo-seed/seed.ts, "Re-clear the
 * participant login's current-week score") -- reusing that design instead
 * of inventing a second, divergent one. Unlike `--refresh`, this does NOT
 * shift any week dates; "current week" here is simply "the most recent
 * week_of this staff member has a weekly_scores row for," which DEMO-1a's
 * seed (and its own --refresh) guarantee is always the current week -- so
 * this is safe to run between every take without touching anything else
 * `--refresh` is responsible for (the org-wide date shift, password sync).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same var names
 * scripts/demo-seed/.env.example uses, so one .env can serve both tools).
 * The service role key bypasses Row Level Security, so this:
 *   - only ever runs locally, never in the recorded browser context itself
 *   - is opt-in: skipped entirely (not a hard failure) unless both env vars
 *     are present, and further disable-able with DEMO_CLIP1_AUTO_RESET=false
 *   - only ever touches confidence_score/date/late on the one staff row
 *     matched by the configured demo-staff email, for its single latest
 *     weekly_scores week
 *
 * If SUPABASE_SERVICE_ROLE_KEY isn't configured, the recommended fallback
 * is running `npx tsx scripts/demo-seed/seed.ts --refresh` (DEMO-1a) before
 * recording again -- see demo-capture/README.md "Clip 1 is re-runnable".
 */
import { createClient } from "@supabase/supabase-js";
import { resetClip1Gate, type EnvLike } from "../lib/env.ts";

export interface ResetResult {
  ran: boolean;
  reason?: string;
  clearedRows?: number;
}

export async function resetClip1ConfidenceScore(env: EnvLike, staffEmail: string): Promise<ResetResult> {
  const gate = resetClip1Gate(env);
  if (!gate.shouldRun) {
    return { ran: false, reason: gate.reason };
  }

  const supabase = createClient(gate.url, gate.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: staff, error: staffErr } = await supabase
    .from("staff")
    .select("id")
    .eq("email", staffEmail)
    .maybeSingle();
  if (staffErr) throw staffErr;
  if (!staff) {
    return { ran: false, reason: `No staff row found for "${staffEmail}" -- is the demo org seeded yet?` };
  }

  const { data: latest, error: latestErr } = await supabase
    .from("weekly_scores")
    .select("week_of")
    .eq("staff_id", staff.id)
    .not("week_of", "is", null)
    .order("week_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw latestErr;
  if (!latest?.week_of) {
    return { ran: false, reason: `No weekly_scores rows found for "${staffEmail}" -- is the demo org seeded yet?` };
  }

  const { data: cleared, error: updateErr } = await supabase
    .from("weekly_scores")
    .update({ confidence_score: null, confidence_date: null, confidence_late: null })
    .eq("staff_id", staff.id)
    .eq("week_of", latest.week_of)
    .select("id");
  if (updateErr) throw updateErr;

  return { ran: true, clearedRows: cleared?.length ?? 0 };
}
