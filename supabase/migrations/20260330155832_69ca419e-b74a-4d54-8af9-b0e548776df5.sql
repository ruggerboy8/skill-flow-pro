-- Reset branding data for Test Org 1 so the wizard can be redone
UPDATE public.organizations 
SET app_display_name = NULL, 
    email_sign_off = NULL, 
    reply_to_email = NULL,
    logo_url = NULL,
    brand_color = NULL
WHERE id = '75eb2570-1312-4d17-9559-6595b8597501';

-- Delete any role name overrides for this org
DELETE FROM public.organization_role_names 
WHERE org_id = '75eb2570-1312-4d17-9559-6595b8597501';