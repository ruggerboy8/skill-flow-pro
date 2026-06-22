-- =============================================================================
-- Security RLS hardening — APPLIED to the live database on 2026-06-22
-- =============================================================================
-- Applied directly via SQL (the path documented in CLAUDE.md — `supabase db push`
-- does not work in this repo) and recorded as migration
-- `security_rls_hardening_2026_06_22`. Verified post-apply against pg_policies.
--
-- This file is the human-readable record. To make it permanent in version
-- control / reproducible from files, this SQL should also land on `main` for
-- Lovable to track (follow-up).
--
-- Findings closed (see docs/audits/security-rls-audit.md live-verification addendum):
--   Fix 1 (High):     weekly_scores public backfill UPDATE/DELETE hole
--   Fix 2 (Critical): staff UPDATE cross-org + super-admin self-escalation
--   Fix 3 (Medium):   evaluations readable by staff at 'submitted' (before release)
-- =============================================================================

-- Fix 1
DROP POLICY IF EXISTS "Service role can update backfill scores" ON public.weekly_scores;
DROP POLICY IF EXISTS "Service role can delete backfill scores" ON public.weekly_scores;

-- Fix 2
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

-- Fix 3
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
