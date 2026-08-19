-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260812203042

-- Doctor framework Release 2: Dr. Alex's audit batch (Aug 2026).
-- Review pack: docs/pedagogy/doctor-framework-r2-review.md
-- Deliberately EXCLUDED: action 4024 (call-in-absent), awaiting Alex's verdict.

-- ============================================================
-- Part A: rewrites of existing moves
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: rewrite 192 to a self-assessable consolidation standard ("strive to maximize" cannot be honestly self-assessed). Alex: "agree".', true);

update public.pro_moves
set action_statement = 'I always look for opportunities to consolidate treatment into fewer visits, so families save trips, time out of school, and repeat sedation events.',
    description = 'Consolidating care reduces the financial, emotional, and logistical burden of repeat visits for families, and improves chair utilization for the practice.',
    updated_at = now()
where action_id = 192;

select set_config('app.change_reason',
  'R2 Alex audit: rewrite 203 to a situation-triggered standard. Alex: "yes, agree with proposed language".', true);

update public.pro_moves
set action_statement = 'When a family travels a long distance to reach us or comes through a charitable care program, I always treatment plan definitively rather than watch-and-wait, so essential care is completed in as few visits as possible.',
    conditionally_applicable = true,
    updated_at = now()
where action_id = 203;

select set_config('app.change_reason',
  'R2 Alex audit: rewrite 4014 in Alex''s own language. Her note: "(not every extraction necessitates a space maintainer)" - the move now evaluates whether maintenance is indicated rather than presuming it.', true);

update public.pro_moves
set action_statement = 'When a primary molar is extracted or planned for extraction, I always evaluate whether space maintenance is indicated based on the patient''s age, dental development, eruption status, and clinical circumstances, and document the decision and family discussion when applicable.',
    conditionally_applicable = true,
    updated_at = now()
where action_id = 4014;

-- ============================================================
-- Part B: content adjustments on 192 (mid-appointment ask moves to 4044)
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: 192 content trimmed - the mid-appointment permission ask moves to new move 4044 (Alex approved the optional split). Typo fix in script ("try to take make" -> "try to make").', true);

update public.pro_move_resources
set content_md = $md$- Consistently complete **two quadrants of primary dentition treatment per visit** when patient cooperation and schedule conditions allow.
- Consistently complete **one quadrant of adult dentition treatment during nitrous or oral sedation appointments** when clinically appropriate.
- Ensure treatment plans and clinical execution reflect a deliberate effort to **consolidate care and minimize unnecessary repeat visits**.
- Receive expressions of appreciation from parents for **fewer appointments and efficient care delivery**.

**Operational awareness**

- Remain mindful of **schedule flow and office efficiency**. If the schedule is already running behind or additional treatment would compromise patient flow, expanding treatment may not be appropriate.

**Practice performance indicator**

- Achieve an increase in the doctor's **production per patient metric over time**, reflecting the ability to safely and efficiently complete more care during successful visits while maintaining high clinical standards.$md$,
    updated_at = now()
where action_id = 192 and type = 'doctor_good_looks_like';

update public.pro_move_resources
set content_md = $md$**Setting expectations**

> "Mrs. Smith, our goal today is to complete as much as Johnny can safely and comfortably tolerate. I know we have two fillings planned today, but if he's doing great and I'm able to get more done, I always try to make the most of a good visit for you."

**Framing the benefit**

> "If we can finish more today, it often means one less visit, which saves families time, missed work, and additional sedation or nitrous fees."$md$,
    updated_at = now()
where action_id = 192 and type = 'doctor_script';

update public.pro_move_resources
set content_md = $md$- Did I attempt to complete **at least two quadrants of primary dentition treatment** or **one quadrant of adult dentition treatment** during this sedation/nitrous appointment when appropriate?
- Did I evaluate the patient's **behavior, comfort, and tolerance** to determine whether additional treatment could be completed safely?
- Did I balance **efficiency with quality**, maintaining excellent clinical outcomes while improving speed and workflow?
- Did I consider the **overall schedule and patient flow** before adding additional treatment to ensure we are not negatively impacting other patients?$md$,
    updated_at = now()
where action_id = 192 and type = 'doctor_gut_check';

-- ============================================================
-- Part C: new script for 203 (had none)
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: first script for 203, drafted from its existing why and good-looks-like content. Marked for Alex''s review.', true);

insert into public.pro_move_resources (action_id, type, content_md, display_order, status) values
(203, 'doctor_script', $md$> "Since your family travels quite a way to see us, my goal is to take care of everything essential in as few visits as possible, so you're not making this drive over and over."

> "Because getting here is a real effort for you all, I'm recommending the most definitive option for each of these teeth. It gives us the best chance that once something is treated, it's done for good."$md$, 1, 'active');

-- ============================================================
-- Part D: retire 196 (splits into 4045-4048) and 197 (becomes a prompt)
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: 196 retired and split into four independently assessable moves (4045-4048). Alex: "yes these are good!". Retired, not deleted: its 38 baseline ratings and history remain attached.', true);

update public.pro_moves
set active = false, retired_at = now(), updated_at = now()
where action_id = 196;

select set_config('app.change_reason',
  'R2 Alex audit: 197 retired from scoring; its language survives as an unscored reflection prompt carried into the curriculum work. The scoreable behavior inside it is extracted as 4049 using Alex''s replacement language. Retired, not deleted.', true);

update public.pro_moves
set active = false, retired_at = now(), updated_at = now()
where action_id = 197;

-- ============================================================
-- Part E: new moves
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: new moves from the audit batch. Statements are Alex''s or John''s language as recorded in the review pack; learning content drafted from Alex''s existing materials and pending her review.', true);

insert into public.pro_moves (action_id, role_id, competency_id, action_statement, description, active, status, conditionally_applicable) values
(4044, 4, 404, 'When a child is tolerating treatment well and time permits, I always ask the parent''s permission mid-appointment to complete additional planned treatment the same day.',
 'A good visit is a scarce resource; asking permission honors the parent''s role while saving the family a trip and a sedation event.', true, 'active', true),
(4045, 4, 408, 'I always keep routine exams to about five minutes of doctor time.',
 'Exam time is the doctor''s scarcest resource and the schedule is built on it. Focus, not speed, is what families experience.', true, 'active', false),
(4046, 4, 408, 'I always keep nitrous appointments to no more than 20 minutes of treatment time.',
 'Nitrous gives a limited cooperation window; procedures are scoped to fit it rather than the window stretched to fit the plan.', true, 'active', false),
(4047, 4, 408, 'I always keep oral sedation appointments to no more than 40 minutes of treatment time.',
 'Oral sedation has a depth and duration window; working past it trades safety margin and the child''s experience for production.', true, 'active', false),
(4048, 4, 408, 'I always keep parent conversations purposeful, warmly redirecting when they drift.',
 'Parent conversation is the highest-value time in the visit, which is exactly why it deserves protection.', true, 'active', false),
(4049, 4, 407, 'Before stepping away from the clinical floor, I always make sure current patients have been attended to, the team has what they need, and no exams, checks, or clinical needs are waiting on me.',
 'The clinical floor runs on the doctor''s availability. Stepping away is fine; stepping away clean is the discipline.', true, 'active', true),
(4050, 4, 413, 'After presenting a treatment plan, I always ask the parent to share their understanding of the plan back to me, so I can fill any gaps before they leave.',
 'Parents routinely leave with a different understanding than the doctor believes was communicated; the gap is cheap to fix only while everyone is still in the room.', true, 'active', true),
(4051, 4, 413, 'When presenting a treatment plan, I always give parents explicit permission to push back and invite them to explore alternatives with me.',
 'Parents who will not voice doubts in the room vote with the schedule instead. Explicit permission moves the objection somewhere it can be addressed.', true, 'active', true),
(4052, 4, 410, 'When a parent declines recommended treatment, I always repeat their decision back out loud and ask a curious, open-ended question to better understand their rationale.',
 'A decline met with pressure ends the conversation; a decline met with curiosity keeps the relationship and usually surfaces an addressable concern.', true, 'active', true),
(4053, 4, 411, 'When a parent communicates that cost is a barrier to care, I always ask whether there is a budget we should be mindful of, and whether they want to see every option we would recommend, including those insurance may not cover.',
 'Cost is the most common unspoken driver of declined care, and families rarely raise it twice. Asking respects both their reality and their autonomy.', true, 'active', true),
(4054, 4, 413, 'When a parent communicates that cost is a barrier to care, I always acknowledge the concern without judgment, name the clinically sound alternatives that could change the cost, and personally connect the family with our treatment coordinator.',
 'How the doctor handles the cost moment decides whether the family leaves with a path or a dead end.', true, 'active', true),
(4055, 4, 412, 'When a parent seems overwhelmed by findings or a plan, I always name what I am noticing out loud, normalize it, and ask an open question about what is going through their mind.',
 'An overwhelmed parent has stopped absorbing information, and decisions made in that state do not hold. Naming stays vague on the emotion deliberately.', true, 'active', true);

-- ============================================================
-- Part F: restorations (original wording and IDs, per John)
-- ============================================================
select set_config('app.change_reason',
  'R2 Alex audit: restored with original wording and original action_id. Alex: "I did not remember deleting these lol. i think this one should stay" / "we can put this one back" / "put it back". Original hard-delete predates the R3 delete guard; statements recovered from seed migration 20260205213744. Learning content was lost with the deletion and is drafted fresh, pending Alex''s review.', true);

insert into public.pro_moves (action_id, role_id, competency_id, action_statement, description, active, status, conditionally_applicable) values
(4007, 4, 403, 'I always chart an appropriate caries risk assessment for every patient.',
 'Caries risk determines radiograph frequency, preventive strategies, and recall intervals.', true, 'active', false),
(4040, 4, 413, 'I always briefly introduce our AI technology and explain our proactive philosophy of care during exam appointments.',
 'When families understand how diagnoses are formed, they are more confident in recommendations.', true, 'active', false),
(4041, 4, 414, 'I always ensure the parent and RDA clearly understand the next appointment before leaving the room.',
 'Unclear next steps commonly cause missed appointments, delayed treatment, and parent frustration.', true, 'active', false);