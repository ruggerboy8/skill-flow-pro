
-- Temporarily move Johno to sandbox org for testing
UPDATE staff
SET primary_location_id = '99999999-9999-9999-9999-999999999991'
WHERE email = 'johno@reallygoodconsulting.org';
