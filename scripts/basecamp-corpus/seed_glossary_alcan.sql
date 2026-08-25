-- Alcan house-vocabulary seed for corpus_glossary (ASK-6).
-- DATA, not infra: this is Alcan-specific. A second org gets its own seed
-- with the same column shape. Re-runnable: on conflict (org_id, term) do
-- nothing, so hand-edits made in the table are never clobbered by a re-seed.
-- `notes` flags entries a human should confirm.

insert into public.corpus_glossary (org_id, term, aliases, category, definition, maps_to, notes)
values
-- ── Roles (the vocabulary gap that motivated this) ───────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'Front Desk',
 array['DFI','DFIs','Director of First Impressions','front office','front desk coordinator','front desk staff'],
 'role',
 'The patient-facing front-desk role. At Alcan this is called the DFI (Director of First Impressions). Owns the first phone call, greeting and checking families in, scheduling, insurance questions, and portal registration.',
 'operations', null),

('a1ca0000-0000-0000-0000-000000000001', 'Dental Assistant',
 array['RDA','RDAs','DA','DAs','assistant','registered dental assistant','chairside assistant'],
 'role',
 'The clinical chairside assistant role. At Alcan, assistants are RDAs (Registered Dental Assistants): they set up rooms, assist the doctor chairside, monitor nitrous, and guide families through treatment.',
 'RDA practice', null),

('a1ca0000-0000-0000-0000-000000000001', 'Lead Dental Assistant',
 array['Lead DA','Lead RDA','lead assistant','lead'],
 'role',
 'A senior RDA who coaches and leads the other assistants at a location while still working chairside.',
 'RDA practice', null),

('a1ca0000-0000-0000-0000-000000000001', 'Office Manager',
 array['OM','OMs','practice manager','office lead'],
 'role',
 'Runs the day-to-day operations of a location: staffing, scheduling authority (including who may cancel or reschedule surgery/GA cases), and front-office oversight.',
 'operations', null),

('a1ca0000-0000-0000-0000-000000000001', 'Doctor',
 array['provider','dentist','pediatric dentist','DDS','DMD','doc'],
 'role',
 'The treating pediatric dentist / provider.',
 'clinical', null),

-- ── Organization & brands ────────────────────────────────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'Alcan Dental Cooperative',
 array['Alcan','ADC','the cooperative','the co-op'],
 'team',
 'The parent organization: a cooperative of pediatric dental practices founded by Dr. Alex and Tim in 2016, built to transform pediatric dentistry with mentorship and servant leadership at its core.',
 null, null),

('a1ca0000-0000-0000-0000-000000000001', 'Kids Tooth Team',
 array['KTT','kids tooth team'],
 'team',
 'A pediatric practice brand/group within Alcan Dental Cooperative. "Team" is core to the company identity.',
 null, 'Confirm exact brand-to-location mapping with operations.'),

-- ── Core values (from the Culture Guide) ─────────────────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'Radical Candor',
 array['radical candor'],
 'value',
 'An Alcan core value: address issues and give vital feedback immediately and directly, in every direction (not just top-down), to prevent drama and focus on solutions.',
 null, null),

('a1ca0000-0000-0000-0000-000000000001', 'Extreme Ownership',
 array['extreme ownership','it is not my job','not my job'],
 'value',
 'An Alcan core value: everyone takes ownership and accountability; "it''s not my job" does not exist here, and finger-pointing is not tolerated.',
 null, null),

('a1ca0000-0000-0000-0000-000000000001', 'Zero defect',
 array['zero-defect','safety first','zero defect culture'],
 'value',
 'Alcan''s safety standard: nothing is more important than patient safety, so every person is expected to know and follow all office safety procedures every day.',
 null, null),

-- ── Tools & systems ──────────────────────────────────────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'CareStack',
 array['carestack','care stack','the PMS','practice management software'],
 'tool',
 'Alcan''s practice-management software: scheduling, charting, patient records, and referral letters.',
 null, null),

('a1ca0000-0000-0000-0000-000000000001', 'Reach',
 array['reach answering service','the answering service'],
 'tool',
 'The after-hours answering service that routes patient calls to the on-call doctor.',
 null, 'Confirm current after-hours vendor with operations before treating as canon.'),

('a1ca0000-0000-0000-0000-000000000001', 'Thinkific',
 array['thinkific'],
 'tool',
 'The online learning platform that hosts Alcan training courses.',
 null, 'Relationship to "Done Desk" course assignments unconfirmed; verify.'),

-- ── Clinical procedures & acronyms ───────────────────────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'General anesthesia',
 array['GA','general anaesthesia','sedation case','OR case','surgery case'],
 'procedure',
 'Full general anesthesia for dental treatment, typically for extensive cases or very young or anxious patients.',
 'clinical', null),

('a1ca0000-0000-0000-0000-000000000001', 'IV sedation',
 array['IV','intravenous sedation'],
 'procedure',
 'Intravenous sedation for dental treatment; often grouped with GA for scheduling and cancellation rules.',
 'clinical', null),

('a1ca0000-0000-0000-0000-000000000001', 'Nitrous oxide',
 array['nitrous','laughing gas','N2O','gas'],
 'procedure',
 'Inhaled nitrous oxide (laughing gas) for mild sedation and anxiety management; RDAs monitor its use.',
 'clinical', null),

('a1ca0000-0000-0000-0000-000000000001', 'Silver Diamine Fluoride',
 array['SDF','silver diamine'],
 'procedure',
 'A topical applied to arrest decay in primary teeth without drilling.',
 'clinical', null),

('a1ca0000-0000-0000-0000-000000000001', 'Radiographs',
 array['X-rays','xrays','x-ray','radiograph','images','diagnostic imaging'],
 'procedure',
 'Dental X-rays / diagnostic imaging taken as part of exams; Alcan''s standard of care is to take its own updated images.',
 'clinical', null),

('a1ca0000-0000-0000-0000-000000000001', 'Frenectomy',
 array['frenectomy','tongue tie','tongue-tie','lip tie','lip-tie','frenulum'],
 'procedure',
 'A procedure to release a restrictive tongue-tie or lip-tie (frenulum).',
 'clinical', null),

-- ── Programs ─────────────────────────────────────────────────────────────
('a1ca0000-0000-0000-0000-000000000001', 'Membership plan',
 array['membership','in-house membership','dental membership','savings plan'],
 'program',
 'Alcan''s in-house membership / savings plan for families, often introduced at check-in.',
 null, null)

on conflict (org_id, term) do nothing;
