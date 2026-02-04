# Paused User Data Exclusion - COMPLETE ✅

## Changes Applied

Added `is_paused = false` filter to three database objects:

1. **`view_staff_submission_windows`** - Paused users no longer generate submission window records
2. **`get_staff_weekly_scores` RPC** - Paused users no longer appear in Coach Dashboard 
3. **`get_location_domain_staff_averages` RPC** - Paused users excluded from evaluation domain averages

## Impact

- Coach Dashboard now shows only active staff
- Regional Dashboard location cards show accurate staff counts and submission rates
- Evaluation averages exclude paused users
- Individual staff detail pages still accessible for historical data if navigated directly

## No Data Cleanup Required

Verified: No actual scores or evaluations exist for paused users after their pause dates. The issue was purely in the view/aggregation layer.
