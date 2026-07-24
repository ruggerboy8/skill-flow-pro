-- Applied live 2026-07-25 (roadmap 2.4 slice C); repo record. The three live
-- RPCs that referenced weekly_focus/weekly_plan (get_best_weekly_win,
-- get_my_weekly_scores, get_staff_all_weekly_scores) now resolve legacy scores
-- via weekly_scores.site_action_id. Side effect: fixes the participant win
-- banner, which had returned nothing for assignments-era scores. Authoritative
-- SQL: applied migration "rewrite_history_rpcs_site_action_based".
select 1;
