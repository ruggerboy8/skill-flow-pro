-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260622182752

-- Security RLS hardening (2026-06-22)
-- Fix 1: remove the public UPDATE/DELETE "backfill" hole on weekly_scores.
-- These were granted to {public}, not service_role. Legitimate own-score edits are
-- covered by the "Own scores" owner policy; admin backfill RPCs are SECURITY DEFINER.
DROP POLICY IF EXISTS "Service role can update backfill scores" ON public.weekly_scores;
DROP POLICY IF EXISTS "Service role can delete backfill scores" ON public.weekly_scores;

-- Fix 2: scope coach/admin staff edits to the caller's own org and forbid super-admin
-- escalation. Mirrors the predicate already used by the working "Coaches can read staff
-- in own org" SELECT policy. No app code performs direct staff UPDATEs under a user
-- session (admin-users edge function uses the service role).
DROP POLICY IF EXISTS "Coaches can manage staff privileges" ON public.staff;
CREATE POLICY "Coaches can manage staff in own org"
  ON public.staff FOR UPDATE TO authenticated
  USING (
    is_coach_or_admin(auth.uid())
    AND org_id_of_staff(id) = current_user_org_id()
  )
  WITH CHECK (
    is_coach_or_admin(auth.uid())
    AND org_id_of_staff(id) = current_user_org_id()
    AND is_super_admin = false
  );

-- Fix 3: staff may read an evaluation only after it is RELEASED (is_visible_to_staff),
-- not merely 'submitted'. Verified: 0 released evals lack is_visible_to_staff, so no
-- currently-released eval is hidden by this change.
DROP POLICY IF EXISTS "Staff can read submitted evaluations" ON public.evaluations;
CREATE POLICY "Staff can read released evaluations"
  ON public.evaluations FOR SELECT TO authenticated
  USING (
    is_visible_to_staff = true
    AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = evaluations.staff_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can read items from submitted evaluations" ON public.evaluation_items;
CREATE POLICY "Staff can read items from released evaluations"
  ON public.evaluation_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations e
      JOIN staff s ON s.id = e.staff_id
      WHERE e.id = evaluation_items.evaluation_id
        AND s.user_id = auth.uid()
        AND e.is_visible_to_staff = true
    )
  );