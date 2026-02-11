

# Fix Masquerade Support for Evaluation Review Flow

## Problem

Two components query the `staff` table using `user_id` (the logged-in admin) instead of respecting the masqueraded staff member. When masquerading as Ana Soto Bernal, the EvalReadyCard never appears and EvaluationReview would reject access.

## Changes

### 1. `src/components/home/EvalReadyCard.tsx`

- Import `useStaffProfile` (which already supports masquerade) instead of manually querying staff by `user_id`
- Use the staff ID from `useStaffProfile` to fetch unreleased evaluations
- Remove the inline staff lookup from the query function

### 2. `src/pages/EvaluationReview.tsx`

- Import `useStaffProfile` and use its staff ID for the ownership check
- Replace the `supabase.from('staff').select('id').eq('user_id', user.id)` call with the masquerade-aware staff profile
- Keep the same validation logic (`evaluation.staff_id !== staffId` guard) but use the correct ID

Both files follow the same pattern already established in `ThisWeekPanel` and other masquerade-aware components: use `useStaffProfile()` to get the staff record instead of querying by `user_id`.

No new dependencies, RPCs, or migrations needed.
