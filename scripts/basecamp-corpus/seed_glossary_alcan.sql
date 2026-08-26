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
 null, 'No corpus source found; unverified. Confirm the current after-hours vendor with operations.'),

('a1ca0000-0000-0000-0000-000000000001', 'Thinkific',
 array['thinkific'],
 'tool',
 'Formerly referenced as an online learning platform for Alcan training. RETIRED / no longer in use (per John, 2026-08-25).',
 null, 'No corpus source found; RETIRED per John 2026-08-25. Candidate for deletion.'),

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
 'clinical', null)

-- NOTE: 'Membership plan' was intentionally removed 2026-08-26 — it is a
-- general_uk concept; Alcan (pediatric_us) has no membership plan.

on conflict (org_id, term) do nothing;

-- Provenance grounding (ASK-6 follow-up). Rows insert at the default
-- provenance='assumption'; this block classifies each entry and links the
-- corpus documents that back it. Portable: it matches by term / source_item_id
-- and pulls representative (not exhaustive) doc ids via subselect, so it works
-- in any environment without hardcoded uuids. Re-runnable.
do $$
declare org uuid := 'a1ca0000-0000-0000-0000-000000000001';
begin
  -- Culture-guide-grounded entries: cite the exact culture doc.
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select id from corpus_documents where org_id=org and source_item_id='culture-guide:history')
    where org_id=org and term='Alcan Dental Cooperative';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select id from corpus_documents where org_id=org and source_item_id='culture-guide:value-03-radical-candor')
    where org_id=org and term='Radical Candor';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select id from corpus_documents where org_id=org and source_item_id='culture-guide:value-09-extreme-ownership')
    where org_id=org and term='Extreme Ownership';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select id from corpus_documents where org_id=org and source_item_id='culture-guide:value-01-safety')
    where org_id=org and term='Zero defect';

  -- Corpus-term-grounded entries: representative doc ids (not exhaustive).
  -- Pro-move matches are restricted to Alcan's practice type (pediatric_us);
  -- basecamp + culture docs are Alcan-origin already. This guard is why the
  -- 2026-08-26 UK leak cannot re-enter a citation. Reused below via the
  -- `d.source_kind <> 'authored' OR pediatric_us OR culture-guide` clause.
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and (d.source_kind <> 'authored'
           or d.source_item_id like 'culture-guide:%'
           or exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us']))
      and (d.body ilike '%DFI%' or d.body ilike '%first impression%' or d.title ilike 'Front Desk pro move%')
      order by d.source_kind, d.title limit 3)
    where org_id=org and term='Front Desk';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and d.title ilike 'Dental Assistant pro move%'
      and exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us'])
      order by d.title limit 3)
    where org_id=org and term='Dental Assistant';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and (d.title ilike '%lead%' or d.body ilike '%lead rda%' or d.body ilike '%lead dental assistant%')
      and (d.source_kind <> 'authored'
           or exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us']))
      order by d.title limit 3)
    where org_id=org and term='Lead Dental Assistant';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and d.body ilike '%office manager%'
      and (d.source_kind <> 'authored'
           or exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us']))
      order by d.source_kind, d.title limit 3)
    where org_id=org and term='Office Manager';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and d.body ilike '%kids tooth%' order by d.title limit 3)
    where org_id=org and term='Kids Tooth Team';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and d.body ilike '%carestack%'
      and (d.source_kind <> 'authored'
           or exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us']))
      order by d.source_kind, d.title limit 3)
    where org_id=org and term='CareStack';
  update corpus_glossary set provenance='corpus',
    source_document_ids = array(select d.id from corpus_documents d where d.org_id=org and d.status in ('kept','canon')
      and d.body ilike '%radiograph%'
      and (d.source_kind <> 'authored'
           or exists (select 1 from pro_moves pm where ('promove:'||pm.action_id)=d.source_item_id and pm.practice_types @> array['pediatric_us']))
      order by (d.title ilike '%refusal%') desc, d.title limit 3)
    where org_id=org and term='Radiographs';

  -- Standard clinical / role definitions: general knowledge, no Alcan source.
  update corpus_glossary set provenance='domain_knowledge', source_document_ids='{}'
    where org_id=org and term in ('Doctor','General anesthesia','IV sedation','Nitrous oxide','Silver Diamine Fluoride','Frenectomy');

  -- Unverified assumptions with NO corpus source (see notes on each row).
  update corpus_glossary set provenance='assumption', source_document_ids='{}'
    where org_id=org and term in ('Reach','Thinkific');
end $$;
