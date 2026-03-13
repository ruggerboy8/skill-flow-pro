-- Rename admin_audit.scope_organization_id to scope_group_id
-- to align with the practice_groups rename (organizations → practice_groups)

ALTER TABLE public.admin_audit
  RENAME COLUMN scope_organization_id TO scope_group_id;
