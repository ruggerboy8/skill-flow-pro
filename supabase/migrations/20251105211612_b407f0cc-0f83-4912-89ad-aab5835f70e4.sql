
-- Enable participant flag for Johno to test user experience
UPDATE staff
SET is_participant = true
WHERE email = 'johno@reallygoodconsulting.org';
