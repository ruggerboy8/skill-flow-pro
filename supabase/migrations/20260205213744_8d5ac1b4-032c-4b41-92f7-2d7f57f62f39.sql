-- =============================================================
-- Doctor (role_id=4) Competencies and Pro Moves Population
-- =============================================================

-- First, add missing competencies for doctors
-- Using competency_id 402-413 for new doctor competencies

-- Clinical Domain (domain_id = 1)
INSERT INTO competencies (competency_id, role_id, domain_id, name, tagline, status)
VALUES 
  (402, 4, 1, 'Preventative Care', 'Early detection enables proactive intervention', 'active'),
  (403, 4, 1, 'Smart Imaging and Diagnostics', 'Right images at the right time', 'active'),
  (404, 4, 1, 'Treatment Planning for Long Term Health', 'Evidence-based care for lasting outcomes', 'active')
ON CONFLICT (competency_id) DO UPDATE SET 
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status;

-- Clerical Domain (domain_id = 2)
INSERT INTO competencies (competency_id, role_id, domain_id, name, tagline, status)
VALUES 
  (405, 4, 2, 'Chairside Closeout', 'Complete documentation before departure', 'active'),
  (406, 4, 2, 'Follow Through and Review', 'Timely responses build trust', 'active')
ON CONFLICT (competency_id) DO UPDATE SET 
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status;

-- Cultural Domain (domain_id = 3)
INSERT INTO competencies (competency_id, role_id, domain_id, name, tagline, status)
VALUES 
  (407, 4, 3, 'Reliability & Professionalism', 'Consistent presence builds team trust', 'active'),
  (408, 4, 3, 'Team Flow & RDA Partnership', 'Let the RDA guide the day', 'active'),
  (409, 4, 3, 'Family Presence & Communication', 'Calm presence builds patient trust', 'active'),
  (410, 4, 3, 'Standards, Boundaries & Escalation', 'Empathy without compromising care', 'active')
ON CONFLICT (competency_id) DO UPDATE SET 
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status;

-- Case Acceptance Domain (domain_id = 4)
INSERT INTO competencies (competency_id, role_id, domain_id, name, tagline, status)
VALUES 
  (411, 4, 4, 'Values-First Discovery', 'Ask priorities before presenting options', 'active'),
  (412, 4, 4, 'Comfort, Safety & Sedation Guidance', 'Safety-driven sedation recommendations', 'active'),
  (413, 4, 4, 'Clear Options to Clear Plan', 'Guide families to confident decisions', 'active'),
  (414, 4, 4, 'Trust Through Predictability', 'Clear expectations prevent surprises', 'active')
ON CONFLICT (competency_id) DO UPDATE SET 
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status;

-- =============================================================
-- Now insert all Doctor Pro Moves
-- Using action_id 4003+ for new doctor pro moves
-- =============================================================

-- Clinical Domain - Chart Accuracy (competency_id = 401) - already has 3 moves
-- No new moves needed for Chart Accuracy

-- Clinical Domain - Preventative Care (competency_id = 402)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4003, 4, 402, 'I always identify and verbally call out incipient lesions or watches so they are accurately charted.', 
   'Early lesions guide preventive care, monitoring, and parent education. If they are not charted, opportunities for early intervention are lost.', true, 'active'),
  (4004, 4, 402, 'I always use clear, accurate language when explaining conditions to families, avoiding minimizing terms.', 
   'Minimizing language can lead to misunderstanding, delayed care, and erosion of trust. Clear language supports informed decision-making.', true, 'active'),
  (4005, 4, 402, 'I always offer sealants on healthy posterior primary and permanent teeth, regardless of insurance coverage.', 
   'Sealants significantly reduce caries risk. Families deserve to know preventive options even if insurance does not cover them.', true, 'active'),
  (4006, 4, 402, 'I always offer proactive preventive options (such as SDF or Curodont) for incipient lesions, regardless of insurance coverage, on children who can safely tolerate the procedure.', 
   'Minimally invasive options allow early intervention and avoid progression.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Clinical Domain - Smart Imaging and Diagnostics (competency_id = 403)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4007, 4, 403, 'I always chart an appropriate caries risk assessment for every patient.', 
   'Caries risk determines radiograph frequency, preventive strategies, and recall intervals.', true, 'active'),
  (4008, 4, 403, 'I always ensure appropriate radiographs are taken for patients with elevated or high caries risk.', 
   'Higher-risk patients require more frequent and targeted imaging to avoid missed disease.', true, 'active'),
  (4009, 4, 403, 'I always instruct RDAs to take PAs for any teeth planned for extraction or pulp therapy, or with caries approaching the pulp.', 
   'PAs are essential for accurate diagnosis and informed consent prior to more invasive treatment.', true, 'active'),
  (4010, 4, 403, 'I always perform a comprehensive evaluation and full series of high-quality radiographs for new patient limited, or referral exams.', 
   'Limited exams for new patients often underrepresent disease. High-quality in-house imaging is necessary for accurate diagnosis.', true, 'active'),
  (4011, 4, 403, 'I always recommend a pano at new patient exams (around age 6–7+) and every three years thereafter, regardless of insurance coverage.', 
   'Panoramic imaging tracks growth, development, missing teeth, and pathology.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Clinical Domain - Treatment Planning for Long Term Health (competency_id = 404)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4012, 4, 404, 'I always offer definitive restorative treatment for lesions extending past the DEJ.', 
   'Once decay has progressed into dentin, monitoring alone is no longer appropriate. Definitive treatment is the standard of care.', true, 'active'),
  (4013, 4, 404, 'I always offer both white and silver crown options when full-coverage restorations are indicated.', 
   'Families value choice and transparency on esthetics, durability, and outcomes. Equitable care means ensuring all families are informed of all options.', true, 'active'),
  (4014, 4, 404, 'I always consider the need for space maintenance when a primary tooth is extracted.', 
   'Premature tooth loss can affect eruption and alignment. Space maintainers help prevent bigger issues down the road.', true, 'active'),
  (4015, 4, 404, 'I always include the offering of treatment options with the highest long-term success rates in my recommendations.', 
   'Families deserve evidence-based guidance and comprehensive care options that yield the highest long-term results.', true, 'active'),
  (4016, 4, 404, 'I always consider the need for an orthodontic evaluation around ages 7–8 and an oral surgery evaluation for third molars when appropriate.', 
   'Early evaluation allows proactive planning and prevention of more complex issues.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Clerical Domain - Chairside Closeout (competency_id = 405)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4017, 4, 405, 'I always sign my clinical notes at the chair before the patient leaves.', 
   'Timely documentation ensures accuracy, prevents backlogs, and protects clinical integrity.', true, 'active'),
  (4018, 4, 405, 'I always send patient referrals at the chair before the patient leaves.', 
   'Immediate referrals reduce delays, confusion, and follow-up failures.', true, 'active'),
  (4019, 4, 405, 'I always print prescriptions at the chair before the patient leaves.', 
   'This prevents missed medications and unnecessary callbacks.', true, 'active'),
  (4020, 4, 405, 'I always complete sedation medication logs at the time of sedation.', 
   'Real-time documentation is critical for safety, compliance, and auditing.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Clerical Domain - Follow Through and Review (competency_id = 406)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4021, 4, 406, 'I always complete email- or staff-requested tasks (insurance narratives, 22-point sheets, parent follow-ups) within 24 hours.', 
   'Delays directly impact case acceptance, scheduling, and parent and team trust.', true, 'active'),
  (4022, 4, 406, 'I always review radiographs using the AI overlay to ensure nothing is overlooked.', 
   'AI supports diagnostic accuracy and consistency, especially in complex cases.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Cultural Domain - Reliability & Professionalism (competency_id = 407)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4023, 4, 407, 'I always am on time for, attend, and actively participate in morning huddle.', 
   'Huddle alignment improves flow, anticipation, and team trust.', true, 'active'),
  (4024, 4, 407, 'I always consider the trust impact on patients and my team when deciding to call in absent to work.', 
   'Absences affect patients, schedules, and team morale. Reliability is a leadership expectation.', true, 'active'),
  (4025, 4, 407, 'I always both receive and give feedback to auxiliary staff in a professional and courteous manner.', 
   'Respectful feedback strengthens culture and performance.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Cultural Domain - Team Flow & RDA Partnership (competency_id = 408)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4026, 4, 408, 'I always allow RDAs to guide the flow of the day and direct me to the next patient.', 
   'RDAs have the full view of the schedule and clinical flow. Declining their guidance disrupts efficiency and patient care.', true, 'active'),
  (4027, 4, 408, 'I always allow the RDA to formally present the patient and guardian for both new patient and recall exams.', 
   'A formal chairside handoff reinforces teamwork, clarity, and professionalism in front of families.', true, 'active'),
  (4028, 4, 408, 'I avoid repeating questions the RDA has just asked/presented, and use targeted follow-up questions when needed.', 
   'Repeating questions undermines the RDA role, erodes team trust, and creates inefficiency.', true, 'active'),
  (4029, 4, 408, 'I always trust the RDA to provide clear and appropriate post-operative instructions.', 
   'RDAs are trained to deliver routine post-op instructions consistently. Delegating allows doctors to focus on reassurance and next steps.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Cultural Domain - Family Presence & Communication (competency_id = 409)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4030, 4, 409, 'I always thank the RDA for the introduction and warmly greet the parent and child with eye contact, reaffirming my name and role when meeting for the first time.', 
   'This sets the tone for the visit. Eye contact and a warm greeting help families feel seen and safe.', true, 'active'),
  (4031, 4, 409, 'I always practice empathy and a service mindset when speaking with families.', 
   'Families must feel heard, respected, and supported—not rushed or minimized. Empathy builds trust.', true, 'active'),
  (4032, 4, 409, 'I always demonstrate self-awareness of my tone, cadence, and nonverbal posture, adjusting to mirror the parent when appropriate.', 
   'Parents and children often mirror the doctor emotional state. Calm, aligned presence supports comprehension and trust.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Cultural Domain - Standards, Boundaries & Escalation (competency_id = 410)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4033, 4, 410, 'I always begin treatment-recommendation–hesitant conversations with curiosity, explain our standards of care, and escalate appropriately when care is routinely declined.', 
   'Empathy does not require providing care below standard or placing a child at risk. When goals remain misaligned, transitioning care can be the most ethical decision.', true, 'active'),
  (4034, 4, 410, 'I always loop in my office manager, regional manager, or Clinical Director when a team issue prevents me from practicing to our standards of care.', 
   'Escalation protects patients, the doctor, and the team—silence does not.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Case Acceptance Domain - Values-First Discovery (competency_id = 411)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4035, 4, 411, 'I always ask parents what the most important thing is about their child''s dental care and experience before offering treatment solutions.', 
   'Families make decisions through their values. Asking first lets the doctor tailor pacing, language, and options so care feels collaborative.', true, 'active'),
  (4036, 4, 411, 'I always align treatment recommendations with what the family identifies as most important.', 
   'When families hear their priorities reflected back, trust increases and resistance decreases.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Case Acceptance Domain - Comfort, Safety & Sedation Guidance (competency_id = 412)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4037, 4, 412, 'I always offer safe and clinically appropriate sedation modalities and clearly explain when certain options are not appropriate.', 
   'Families deserve a thoughtful sedation discussion based on safety and likelihood of success—not convenience.', true, 'active'),
  (4038, 4, 412, 'I always perform a pre-treatment check-in with parents that outlines possible outcomes and reinforces our promise to the child''s comfort.', 
   'Expectation-setting protects trust if plans change and supports trauma-informed care.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Case Acceptance Domain - Clear Options to Clear Plan (competency_id = 413)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4039, 4, 413, 'I always discuss appropriate treatment and sedation options with families and arrive at a clear, guided recommendation together before directing the RDA to chart the treatment plan.', 
   'Shared decision-making should not feel fragmented. The doctor leads the conversation and arrives at one clear recommended plan.', true, 'active'),
  (4040, 4, 413, 'I always briefly introduce our AI technology and explain our proactive philosophy of care during exam appointments.', 
   'When families understand how diagnoses are formed, they are more confident in recommendations.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Case Acceptance Domain - Trust Through Predictability (competency_id = 414)
INSERT INTO pro_moves (action_id, role_id, competency_id, action_statement, description, active, status)
VALUES 
  (4041, 4, 414, 'I always ensure the parent and RDA clearly understand the next appointment before leaving the room.', 
   'Unclear next steps commonly cause missed appointments, delayed treatment, and parent frustration.', true, 'active'),
  (4042, 4, 414, 'I always pause to consider the trust impact on the family before modifying a treatment plan that was previously discussed or agreed upon.', 
   'Same-day plan changes can erode trust and create doubt in care consistency, even if well intentioned.', true, 'active'),
  (4043, 4, 414, 'I always provide anticipatory guidance early to set clear expectations for future care.', 
   'When families are prepared in advance for what is coming next, care feels intentional rather than reactive.', true, 'active')
ON CONFLICT (action_id) DO UPDATE SET 
  action_statement = EXCLUDED.action_statement,
  description = EXCLUDED.description,
  active = EXCLUDED.active;