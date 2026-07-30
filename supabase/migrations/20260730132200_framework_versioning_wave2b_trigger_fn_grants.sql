-- Pro Move versioning, Wave 2b: trigger-function grant hardening.
-- Applied to live 2026-07-30 via MCP (as framework_versioning_wave2b_trigger_fn_grants);
-- this file is the repo mirror. Idempotent.
--
-- Trigger functions need no direct EXECUTE (privilege is checked at CREATE TRIGGER
-- time, not per fire). Revoking silences the anon/authenticated SECURITY DEFINER
-- lint and removes them from the exposed RPC surface.
revoke execute on function public.fn_framework_append_only() from public, anon, authenticated;
revoke execute on function public.fn_framework_capture() from public, anon, authenticated;
revoke execute on function public.fn_pro_moves_delete_guard() from public, anon, authenticated;
