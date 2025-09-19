-- Delete the Main Organization and its associated locations
-- First delete the Main Location to avoid foreign key constraints
DELETE FROM locations WHERE organization_id = 'ddf81309-8355-475c-8ff2-9a9f1c3a5f42';

-- Then delete the Main Organization
DELETE FROM organizations WHERE id = 'ddf81309-8355-475c-8ff2-9a9f1c3a5f42' AND name = 'Main Organization';