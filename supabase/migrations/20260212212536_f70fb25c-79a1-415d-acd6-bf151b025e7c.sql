-- Clean up test coaching session for Johno Oberly
DELETE FROM coaching_session_selections WHERE session_id = '26942930-d8ce-47c3-b9bd-9ffbed1b05d4';
DELETE FROM coaching_sessions WHERE id = '26942930-d8ce-47c3-b9bd-9ffbed1b05d4';