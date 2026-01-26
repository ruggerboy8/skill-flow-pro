-- Insert 16 Office Manager competencies (role_id = 3)

-- Clinical Domain (domain_id = 1)
INSERT INTO competencies (competency_id, role_id, domain_id, name, tagline, friendly_description, status) VALUES
(33, 3, 1, 'Quality Through Feedback', 'Hear parents, fix systems', 'You connect the dots between what parents say, what you observe, and what needs to change—keeping the clinical team aligned on what matters most.', 'active'),
(34, 3, 1, 'Team Training Oversight', 'Keep skills sharp and current', 'You make sure clinical staff stay on track with trainings, certifications, and growth plans—so no one falls behind and everyone keeps improving.', 'active'),
(35, 3, 1, 'Patient Care Standards', 'Guard the patient experience', 'You confirm that every patient-facing step—from intake to post-op—runs consistently, and you step in fast when something drifts off course.', 'active'),
(36, 3, 1, 'Compliance and Safety', 'Keep systems tight and current', 'You own the behind-the-scenes systems that keep the practice safe and compliant—checking, correcting, and staying ahead of issues before they become problems.', 'active'),

-- Clerical Domain (domain_id = 2)
(37, 3, 2, 'Operational Efficiency', 'Find waste, fix it, scale it', 'You review what''s working and what''s leaking—then test changes and lock in the wins that protect both revenue and the patient experience.', 'active'),
(38, 3, 2, 'Schedule and Flow', 'Smooth arrivals to goodbyes', 'You actively manage the schedule, staffing, and room flow so patients move through smoothly—minimizing waits, confusion, and bottlenecks.', 'active'),
(39, 3, 2, 'Root Cause Analysis', 'Look past symptoms, fix drivers', 'You use data and patterns to dig past surface issues, find the real cause, and lead changes that stop problems from repeating.', 'active'),
(40, 3, 2, 'Revenue Cycle Management', 'Keep cash flow healthy', 'You own the money pipeline—making sure claims, collections, and follow-ups happen consistently so the practice stays financially strong.', 'active'),

-- Cultural Domain (domain_id = 3)
(41, 3, 3, 'Leading and Coaching', 'Grow people, not just output', 'You set clear expectations, run effective huddles and 1:1s, give real-time feedback, and coach your team toward both growth and results.', 'active'),
(42, 3, 3, 'Trust Building', 'Earn it through follow-through', 'You build trust with families by doing what you say, explaining things clearly, and handling problems with transparency and care.', 'active'),
(43, 3, 3, 'Emotional Intelligence', 'Stay steady, read the room', 'You stay calm under pressure, pick up on emotional cues from staff and parents, and respond in ways that de-escalate and stabilize.', 'active'),
(44, 3, 3, 'Community and Marketing', 'Extend the practice''s reach', 'You support org-level marketing, help the team show up at community events, and nurture relationships with referral partners.', 'active'),

-- Case Acceptance Domain (domain_id = 4)
(45, 3, 4, 'Case Communication', 'Align the team''s message', 'You ensure the team presents treatment clearly and consistently—so parents understand, trust, and feel confident moving forward.', 'active'),
(46, 3, 4, 'Financial Coordination', 'Make money talks easy', 'You make sure families get accurate estimates, verified benefits, and clear payment options—so finances support rather than block care.', 'active'),
(47, 3, 4, 'Treatment Plan Follow-Up', 'Don''t let care slip away', 'You maintain systems that track unscheduled or incomplete treatment and drive timely follow-up so important care doesn''t fall through the cracks.', 'active'),
(48, 3, 4, 'Patient Experience', 'Design the feeling of the visit', 'You shape the overall feel of every visit—environment, small touches, communication—based on feedback and observation, always refining.', 'active');