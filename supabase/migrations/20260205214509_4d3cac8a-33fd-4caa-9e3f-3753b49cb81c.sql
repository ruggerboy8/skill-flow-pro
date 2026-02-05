-- Insert doctor pro move learning materials
-- Mapping pro moves to their resources based on spreadsheet data

-- Pro Move 4001: Chart existing findings at new patient exams
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4001, 'doctor_why', 'An accurate baseline prevents confusion, protects against liability, and ensures we are accurately charting any existing treatment or conditions. It also allows the RDA and AI note-taking systems to capture a complete and accurate starting chart.', 0, 'active'),
(4001, 'doctor_script', '"Calling out existing stainless steel crown on A, existing occlusal composite on J, missing tooth S."', 1, 'active'),
(4001, 'doctor_good_looks_like', '- Review all radiographs and clinical findings
- Verbally call out existing restorations, crowns, extractions, missing teeth
- Ensure these findings are charted before diagnosing new disease', 2, 'active');

-- Pro Move 4002: Update odontogram at every exam
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4002, 'doctor_why', 'The odontogram is a living document. If it is not updated consistently, future providers, assistants, and AI tools cannot rely on it for accurate treatment planning.', 0, 'active'),
(4002, 'doctor_script', '"Let''s update the odontogram—T has exfoliated since the last visit. #30 has erupted, let''s plan a sealant."', 1, 'active'),
(4002, 'doctor_good_looks_like', '- Confirm erupted, missing, restored, or exfoliated teeth
- Update changes at every recall and exam', 2, 'active');

-- Pro Move 189: Verbalize exam note consistently (existing from earlier migration)
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(189, 'doctor_why', 'Consistency ensures nothing is missed, improves documentation accuracy, and allows AI note-taking tools to function reliably. Comprehensive charting allows for comprehensive treatment planning. If we miss the airway evaluation or BMI we may unintentionally plan a high risk patient for oral sedation or not offer the most comprehensive and safe options available.', 0, 'active'),
(189, 'doctor_script', '"Extraoral - no abnormal findings observed, intraoral soft tissue - apthous ulcer present upper right adjacent to tooth #C, Brosdky 3, Mallampati 3 hard tissue findings include…"', 1, 'active'),
(189, 'doctor_good_looks_like', '- Use the same exam flow every time
- Speak findings aloud clearly and completely (so RDA + AI can capture)
- Include airway evaluation + BMI as part of the consistent sequence', 2, 'active');

-- Pro Move 4003: Identify incipient lesions
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4003, 'doctor_why', 'Early lesions guide preventive care, monitoring, and parent education. If they are not charted, opportunities for early intervention are lost. Lesions in the enamel are cavities, so we chart enamel lesions as decay to avoid confusion or minimization of the finding.', 0, 'active'),
(4003, 'doctor_script', '"Incipient lesion on #B- mesial, please mark decay and treatment plan SDF."', 1, 'active'),
(4003, 'doctor_good_looks_like', '- Call out all carious lesions, including enamel-level lesions
- Clearly label them as caries (not "watch" language that minimizes)', 2, 'active');

-- Pro Move 4004: Use clear, accurate language
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4004, 'doctor_why', 'Minimizing language ("just a spot," "tiny cavity" we are "watching") can lead to misunderstanding, delayed care, and erosion of trust. Clear language supports informed decision-making.', 0, 'active'),
(4004, 'doctor_script', '"There is a cavity in the first layer of the tooth. The good news is we can be proactive and preventive at this stage. I''d love to talk to you about SDF or Curodont."', 1, 'active'),
(4004, 'doctor_good_looks_like', '- Describe disease accurately without alarmism
- Frame prevention as proactive, not dismissive', 2, 'active');

-- Pro Move 4005: Offer sealants regardless of coverage
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4005, 'doctor_why', 'Sealants significantly reduce caries risk. Families deserve to know preventive options even if insurance does not cover them.', 0, 'active'),
(4005, 'doctor_script', '"Even when insurance doesn''t cover something, we still believe families deserve to know all preventive options. Sealants help protect teeth from cavities, and I want you to be aware of them and know that they are an easy, great tool for us to use to be proactive and help prevent cavities."', 1, 'active'),
(4005, 'doctor_good_looks_like', '- Offer sealants proactively as a prevention tool (not only when covered)', 2, 'active');

-- Pro Move 4006: Offer SDF/Curodont for incipient lesions
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4006, 'doctor_why', 'Minimally invasive options allow early intervention and avoid progression.', 0, 'active'),
(4006, 'doctor_script', '"Because we use advanced AI-assisted imaging, we''re able to detect very early cavity lesions. That''s a good thing—it allows us to treat them preventively with options like SDF or Curodont instead of drilling or waiting for them to progress."', 1, 'active'),
(4006, 'doctor_good_looks_like', '- Offer minimally invasive options when lesions are early
- Frame early detection as an opportunity to treat preventively (not "wait and see")', 2, 'active');

-- Pro Move 4007: Chart caries risk assessment
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4007, 'doctor_why', 'Caries risk determines radiograph frequency, preventive strategies, and recall intervals.', 0, 'active'),
(4007, 'doctor_script', '"Given multiple lesions and diet history, caries risk is high."', 1, 'active'),
(4007, 'doctor_good_looks_like', '- Assign low/moderate/high based on findings + history', 2, 'active');

-- Pro Move 4008: Appropriate radiographs for high caries risk
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4008, 'doctor_why', 'Higher-risk patients require more frequent and targeted imaging to avoid missed disease.', 0, 'active'),
(4008, 'doctor_script', '"High caries risk—let''s take updated bitewings today and every 6 months until they are disease and caries free for over 2 years."', 1, 'active'),
(4008, 'doctor_good_looks_like', '- Order bitewings or PAs when indicated (based on risk and findings)', 2, 'active');

-- Pro Move 4009: PAs for extractions/pulp therapy
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4009, 'doctor_why', 'PAs are essential for accurate diagnosis and informed consent prior to more invasive treatment and to ensure accurate pulpal status is determined comprehensively.', 0, 'active'),
(4009, 'doctor_script', '"Let''s get a PA on that tooth before confirming what treatment is needed."', 1, 'active'),
(4009, 'doctor_good_looks_like', '- Confirm diagnostic images are obtained before finalizing invasive plans', 2, 'active');

-- Pro Move 4010: Comprehensive eval for new patient/referral exams
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4010, 'doctor_why', 'Limited exams for new patients and referrals often underrepresent disease. Even a single gross carious lesion strongly predicts additional pathology. High-quality in-house imaging is necessary for accurate diagnosis and treatment planning. Additionally, it erodes the trust in us from other providers if we do not thoroughly and comprehensively evaluate referral patients. If we send patients back to referring offices with disease still present it appears as if we were not thorough, missed disease or did not appropriately intervene.', 0, 'active'),
(4010, 'doctor_script', '"Even with outside X-rays, we take our own full series so we can be confident we''re not missing anything and to ensure we provide the most thorough and comprehensive evaluation. Children are often referred to us because other providers were not able to obtain the most accurate images, so it''s very important for us to ensure that we are not missing anything."', 1, 'active'),
(4010, 'doctor_good_looks_like', '- Don''t rely solely on outside X-rays
- Complete a full exam and radiographic series (high-quality, in-house)', 2, 'active');

-- Pro Move 4011: Recommend pano at age 6-7+
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4011, 'doctor_why', 'Panoramic imaging tracks growth, development, missing teeth, and pathology.', 0, 'active'),
(4011, 'doctor_script', '"At this age, a panoramic X-ray helps us see the big picture of growth and development."', 1, 'active'),
(4011, 'doctor_good_looks_like', '- Use pano as part of growth/development assessment and pathology screening', 2, 'active');

-- Pro Move 4012: Offer definitive restorative for lesions past DEJ
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4012, 'doctor_why', 'Once decay has progressed into dentin, monitoring alone or relying on low-success preventive measures is no longer appropriate and may be construed as supervised neglect. At this stage, the standard of care is to offer and recommend definitive restorative treatment to arrest disease progression, prevent pain or infection, and protect the long-term health of the tooth. While families retain the right to decline, there is professional and legal risk if definitive treatment is not clearly offered, explained, and documented as the recommended standard of care.', 0, 'active'),
(4012, 'doctor_script', '"Because this cavity has reached the second layer of the tooth, the most appropriate next step is definitive treatment, such as a filling or crown, to stop the decay."

"Preventive options work well early, but once decay reaches dentin, they''re no longer effective on their own. At this point, we need to talk about proactive treatment to prevent this from getting worse."', 1, 'active'),
(4012, 'doctor_good_looks_like', '- Clearly offer and recommend definitive restorative treatment (not "monitor")
- Explain why preventive-only approaches are no longer sufficient at this stage
- Document that definitive treatment was recommended, discussed, and the family''s decision', 2, 'active');

-- Pro Move 4013: Offer both white and silver crown options
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4013, 'doctor_why', 'Families value choice, clarity, and transparency on esthetics, durability, and outcomes. It is not our role to decide who can or cannot afford or prioritize aesthetic options. Equitable care means ensuring all families are informed of all clinically appropriate choices. When we fail to offer an option, we limit informed decision-making and unintentionally restrict access to ideal care.', 0, 'active'),
(4013, 'doctor_script', '"We have both white zirconia and silver crown options—let''s talk about what matters most to you so we can decide together what is best for your child."

"Both options are clinically appropriate. The main difference is esthetics and insurance coverage, so I always want families to know they have a choice."', 1, 'active'),
(4013, 'doctor_good_looks_like', '- Present both clinically appropriate full-coverage options when indicated (white zirconia and silver crowns)
- Discuss differences in esthetics and coverage transparently without pre-deciding for the family
- Invite family priorities into the choice', 2, 'active');

-- Pro Move 4014: Consider space maintenance
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4014, 'doctor_why', 'Premature tooth loss can affect eruption and alignment. Space maintainers help prevent bigger issues down the road.', 0, 'active'),
(4014, 'doctor_script', '"If this tooth is removed, we''ll discuss a spacer to protect the space for the adult tooth."', 1, 'active'),
(4014, 'doctor_good_looks_like', '- Flag space maintenance as part of extraction planning for primary teeth
- Proactively discuss the purpose (protect space for adult tooth)', 2, 'active');

-- Pro Move 4015: Offer highest long-term success rate options
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4015, 'doctor_why', 'Families deserve evidence-based guidance and comprehensive care options that yield the highest long-term results, not just the easiest or fastest option.', 0, 'active'),
(4015, 'doctor_script', '"I''m recommending this because it has the highest success rate long-term."', 1, 'active'),
(4015, 'doctor_good_looks_like', '- Anchor recommendations in long-term outcomes/success rates (evidence-based guidance)', 2, 'active');

-- Pro Move 4016: Consider ortho eval at 7-8
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4016, 'doctor_why', 'Early evaluation allows proactive planning and prevention of more complex issues. Failure to refer to specialists at age-appropriate times can be a liability.', 0, 'active'),
(4016, 'doctor_script', '"Around this age, I like to get orthodontic eyes on growth early."', 1, 'active'),
(4016, 'doctor_good_looks_like', '- Proactively raise ortho timing as a routine developmental milestone
- Consider OS referral timing for third molars when appropriate', 2, 'active');

-- Pro Move 4017: Sign clinical notes at chair
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4017, 'doctor_why', 'Timely documentation ensures accuracy, prevents backlogs, and protects clinical integrity.', 0, 'active'),
(4017, 'doctor_script', '- Complete and sign the note in real time (at the chair) before discharge', 1, 'active'),
(4017, 'doctor_good_looks_like', 'Threshold: must be signed before the patient leaves (not end-of-day / later backlog)', 2, 'active');

-- Pro Move 4018: Send referrals at chair
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4018, 'doctor_why', 'Immediate referrals reduce delays, confusion, and follow-up failures.', 0, 'active'),
(4018, 'doctor_script', '"We''ll send this referral now so there''s no delay in care."', 1, 'active'),
(4018, 'doctor_good_looks_like', '- Send referral while the patient is still present (no "we''ll do it later")', 2, 'active');

-- Pro Move 4019: Print prescriptions at chair
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4019, 'doctor_why', 'This prevents missed medications and unnecessary callbacks.', 0, 'active'),
(4019, 'doctor_script', '"I''ll print this prescription now so you leave with everything you need."', 1, 'active'),
(4019, 'doctor_good_looks_like', '- Print the prescription during the visit (not after the patient is gone)
- Confirm family leaves with what they need (reduces callbacks)', 2, 'active');

-- Pro Move 4020: Complete sedation med logs at time
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4020, 'doctor_why', 'Real-time documentation is critical for safety, compliance, and auditing.', 0, 'active'),
(4020, 'doctor_good_looks_like', '- Complete the med log immediately after administration (real-time, not end-of-day)', 2, 'active');

-- Pro Move 4021: Complete email/staff requests within 24hrs
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4021, 'doctor_why', 'Delays directly impact case acceptance, scheduling, and parent and team trust.', 0, 'active'),
(4021, 'doctor_good_looks_like', '- Same-day or next-day completion
- Clear, thorough responses (so the team can use it without back-and-forth)', 2, 'active');

-- Pro Move 4022: Review radiographs with AI overlay
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4022, 'doctor_why', 'AI supports diagnostic accuracy and consistency, especially in complex cases.', 0, 'active'),
(4022, 'doctor_script', '"We use AI-assisted imaging to make sure we don''t miss anything and are providing the most proactive conservative care."', 1, 'active'),
(4022, 'doctor_good_looks_like', '- Review radiographs with AI overlay as a second pass / safety net
- Frame AI as supportive (not replacing clinical judgment) when explaining to families', 2, 'active');

-- Pro Move 4023: On time for morning huddle
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4023, 'doctor_why', 'Huddle alignment improves flow, anticipation, and team trust.', 0, 'active'),
(4023, 'doctor_script', '- Arrive on time
- Be present (not multitasking)
- Contribute to alignment (schedule, flow, needs)', 1, 'active'),
(4023, 'doctor_good_looks_like', 'Applies daily: expected at every morning huddle (reliability/attendance is the threshold)', 2, 'active');

-- Pro Move 4024: Consider trust impact when calling in absent
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4024, 'doctor_why', 'Absences affect patients, schedules, and team morale. True emergencies/contagious illness are understood, but frequent or last-minute absences erode trust and disrupt care. Reliability is a leadership expectation.', 0, 'active'),
(4024, 'doctor_good_looks_like', '- Use the internal "gut check" prompts before calling out
- Communicate as early as possible if absence is necessary
- Plan ahead for predictable disruptions (e.g., backup childcare)', 2, 'active'),
(4024, 'doctor_gut_check', '"Have I set up appropriate backup childcare options so my children are covered if they need to stay home from school?"

"If this were my patient''s appointment, would I feel comfortable canceling at the last minute?"

"Am I unsafe or contagious, or simply not feeling 100% but still able to practice safely?"

"Have I communicated early enough to minimize disruption for patients and my team?"', 3, 'active');

-- Pro Move 4025: Give/receive feedback professionally
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4025, 'doctor_why', 'Respectful feedback strengthens culture and performance.', 0, 'active'),
(4025, 'doctor_good_looks_like', '- Give feedback professionally (direct, respectful, specific)
- Receive feedback without defensiveness
- Keep tone courteous, even when correcting', 2, 'active'),
(4025, 'doctor_gut_check', '• Have I been clear about what needs to improve—and kind in how I said it?
• Am I coaching to raise the standard—or venting my frustration?
• Did I give this feedback in a way that preserves trust and dignity?
• Have I also acknowledged what they''re doing well?
• If I were on the receiving end, would I feel supported—or shamed?', 3, 'active');

-- Pro Move 4026: Allow RDAs to guide flow
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4026, 'doctor_why', 'RDAs have the full view of the schedule and clinical flow. Declining their guidance disrupts efficiency and patient care.', 0, 'active'),
(4026, 'doctor_script', '"Just tell me who''s next—I''ll follow your lead."', 1, 'active'),
(4026, 'doctor_good_looks_like', '- Let the RDA direct transitions between chairs
- Respond with "ready" energy (not resistance)
- Maintain pace without undermining RDA authority', 2, 'active');

-- Pro Move 4027: Allow RDA to present patient
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4027, 'doctor_why', 'A formal chairside handoff reinforces teamwork, clarity, and professionalism in front of families. It helps doctors move chair-to-chair without stepping away to pre-review charts, presents a unified clinical team, validates parent concerns, and avoids repetitive questioning that can waste time and erode confidence in the team and the RDA''s leadership role.', 0, 'active'),
(4027, 'doctor_script', 'RDA: "Dr. Alex, this is Sarah… (medical status + concern) …"
Doctor: "Thank you… let''s take a look together…"', 1, 'active'),
(4027, 'doctor_good_looks_like', '- Doctor waits at the chair until the RDA completes the presentation
- RDA presents patient, guardian, medical status, and primary concern in front of family
- Doctor acknowledges/thanks the RDA and builds from what was shared
- Follow-up questions are targeted and additive, not repetitive', 2, 'active');

-- Pro Move 4028: Avoid repeating RDA questions
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4028, 'doctor_why', 'Repeating questions undermines the RDA''s role, erodes team trust, and creates inefficiency. A structured handoff lets the doctor build from gathered information rather than restarting. Clarifying questions are appropriate; blanket repetition is what''s being avoided.', 0, 'active'),
(4028, 'doctor_script', '"Thank you for the overview—I appreciate the update."
"I understand there haven''t been any medical changes. I just want to clarify one thing…"
"I don''t need to repeat those questions—I''ve got the information I need."', 1, 'active'),
(4028, 'doctor_good_looks_like', '- Listen fully to the RDA''s presentation before engaging
- Accept the collected history as accurate/complete unless something is clinically unclear
- Ask clarifying follow-ups only when clinically indicated
- Demonstrate respect for the RDA''s prep in front of the family', 2, 'active');

-- Pro Move 4029: Trust RDA for post-op instructions
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4029, 'doctor_why', 'RDAs are trained to deliver routine post-op instructions consistently. Delegating prevents duplication and allows doctors to focus on reassurance and next steps. For non-routine cases (oral sedation, GA), doctor participation remains appropriate as a relationship and safety measure.', 0, 'active'),
(4029, 'doctor_script', '"The RDA will go over all remaining post-op instructions… you''re in great hands."
"After sedation today, I''ll review the key post-op points with you, and the RDA will go through the full instructions before you leave."', 1, 'active'),
(4029, 'doctor_good_looks_like', '- Routine care: RDA leads post-op instruction review
- Non-routine care (oral sedation, GA): doctor participates in instruction review
- Doctor avoids re-explaining routine instructions already covered
- Doctor stays available for questions/clarification', 2, 'active');

-- Pro Move 4030: Thank RDA and greet warmly
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4030, 'doctor_why', 'This sets the tone for the visit. Acknowledging the RDA reinforces mutual respect. Eye contact and a warm greeting help families feel seen and safe. Reaffirming name/role builds clarity and trust, especially at first meetings.', 0, 'active'),
(4030, 'doctor_script', '"Thank you, Jenni. Hi Sarah, hi Mrs. Smith—I''m Dr. Alex. I''m so glad to see you today."
"Thanks for the introduction. I''m Dr. Alex—welcome, we''re happy you''re here."', 1, 'active'),
(4030, 'doctor_good_looks_like', '- Pause, face the family, make eye contact
- Verbally acknowledge and thank the RDA
- State name and role when appropriate (especially first visit)
- Calm, present, unhurried greeting', 2, 'active');

-- Pro Move 4031: Practice empathy and service mindset
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4031, 'doctor_why', 'Families must feel heard, respected, and supported—not rushed or minimized. Empathy is not just kindness; it''s time, curiosity, and choice. Aligning care with family goals builds trust while still upholding clinical standards.', 0, 'active'),
(4031, 'doctor_script', '"Before we talk options, it is important for me to understand what matters most to you…"

"I want to make sure the plan we''re discussing aligns with your goals…"

"There are a few ways we can approach this…"

"I don''t want to rush this—what questions are coming up for you?"', 1, 'active'),
(4031, 'doctor_good_looks_like', '- Ask priorities before presenting options
- Discuss more than one clinically appropriate option when possible
- Pause when parent is quiet/hesitant (invite questions)
- Stay long enough for processing (don''t "one-and-done" then exit)
- Adjust explanations to the parent''s emotional state, not just the diagnosis', 2, 'active'),
(4031, 'doctor_gut_check', '• Have I asked what matters most to this family, or am I assuming I know?
• Did I offer more than one appropriate option, or just the one that''s easiest or most familiar to me?
• Am I leaving the room because the plan is clear—or because I feel uncomfortable with questions or uncertainty?
• If this were my child, what questions would I still have right now?
• Does this family feel invited to participate, or like they''re being told what to do?
• Am I prioritizing speed, or understanding?
• Have I clearly explained why I''m recommending this, not just what I''m recommending?', 3, 'active');

-- Pro Move 4032: Self-awareness of tone and nonverbal posture
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4032, 'doctor_why', 'Parents and children often mirror the doctor''s emotional state. If a doctor appears rushed, tense, distracted, or guarded, families may feel anxious or dismissed and may be less likely to ask questions or accept care. Calm, aligned presence supports comprehension and trust.', 0, 'active'),
(4032, 'doctor_good_looks_like', 'Observable micro-behaviors:
- Slow speech when parents appear overwhelmed/anxious
- Soften tone for complex or emotionally charged information
- Match parent''s energy level (not overly upbeat when serious; not flat when engaged)
- Open posture (relaxed shoulders; uncrossed arms)
- Remove mask and loupes when speaking with families
- Minimize fidgeting, charting, or multitasking while parent is processing
- Sit or lower to eye level when possible (especially with anxious parents/children)
- Use silence intentionally; pause after recommendations; nod and listen without interrupting', 2, 'active'),
(4032, 'doctor_gut_check', '• Is my tone matching the emotional weight of this conversation?
• Am I speaking at a pace that allows this parent to process—or am I rushing?
• What is my body doing right now—am I open, or closed off?
• If I were the parent, would I feel rushed, intimidated, or dismissed by my posture?
• Have I paused long enough after explaining something for them to respond?
• Am I multitasking because I''m efficient—or because I''m uncomfortable sitting in silence?
• Is my nonverbal communication saying ''I''m present'' or ''I need to get to the next room''?', 3, 'active');

-- Pro Move 4033: Begin hesitant conversations with curiosity
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4033, 'doctor_why', 'Empathy doesn''t require us to provide care below standard or place a child at risk. Repeated monitoring without diagnostics/treatment increases risk to the child and provider. When goals remain misaligned with proactive care, transitioning care can be the most ethical and legally defensible decision.', 0, 'active'),
(4033, 'doctor_script', '"I want to be very transparent with you. Our team practices proactive, comprehensive pediatric dental care, and it becomes uncomfortable for us to continue monitoring disease without appropriate intervention or complete diagnostic information."

"Can you tell me more about what''s making this feel hard right now?"

"We completely respect you and your family making decisions that feel right for you. At the same time, it''s important you know that continuing under our care without X-rays or treatment places us outside the standard of care we''re committed to providing."

"Given the repeated recommendations and ongoing concerns, it may be time to consider transitioning to another provider whose approach better fits what you''re looking for."

"We''re happy to provide records and help with a smooth transition."', 1, 'active'),
(4033, 'doctor_good_looks_like', '- Start with curiosity ("tell me more about what''s making this feel hard")
- Clearly explain risks of delaying/declining care
- Clearly explain your standards of care (proactive, comprehensive)
- Document recommendation and discussion (especially when declined)
- Use respectful boundary language: "We respect your choices" + "we can''t practice outside our standard"
- When needed, introduce transition of care professionally and supportively (records + smooth transition)', 2, 'active'),
(4033, 'doctor_gut_check', '• If this disease progresses, would I feel comfortable defending continued monitoring?
• Have we clearly explained risks and standards of care more than once?
• Are we practicing within our philosophy—or tolerating misalignment out of discomfort?
• Would another provider better align with this family''s preferences?', 3, 'active');

-- Pro Move 4034: Loop in leadership when issues prevent standards
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4034, 'doctor_why', 'Escalation protects patients, the doctor, and the team—silence does not.', 0, 'active'),
(4034, 'doctor_good_looks_like', '- Flag issues early (don''t normalize workarounds that reduce standards)
- Loop in leadership rather than trying to solve chronic team/system issues chairside', 2, 'active');

-- Pro Move 4035: Ask what''s most important before offering solutions
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4035, 'doctor_why', 'Families make decisions through the lens of their values (comfort, safety, prevention, efficiency, esthetics, long-term outcomes). When recommendations come before understanding priorities, even a great plan can feel misaligned or pushy. Asking first lets the doctor tailor pacing, language, and options so care feels collaborative, improving trust and case acceptance without compromising standards of care.', 0, 'active'),
(4035, 'doctor_script', 'Primary: "Before we talk about options, I''d love to know what the most important thing is to you about your child''s dental care and the experience they have with us?"

Reflective: "Thank you for sharing that—so comfort is really important to you. That helps me frame how we think about the best next steps."

If unsure: "Some families really prioritize comfort… others value being proactive… others care most about efficiency… Do any of those resonate with you, or is there something else that''s most important?"

Bridge: "Because comfort is most important to you, I''d recommend we talk about these options."', 1, 'active'),
(4035, 'doctor_good_looks_like', '- Ask the question before listing treatment options
- Listen without interrupting
- Reflect back what the parent said (name the priority out loud)
- Adjust pacing/language/options to match the priority
- Revisit priorities if parent seems hesitant or disengaged', 2, 'active'),
(4035, 'doctor_gut_check', '• Have I asked what matters most to this family, or am I assuming?
• Did I tailor my recommendation to their priority—or just deliver my default plan?
• Would this explanation land differently if comfort or efficiency were their top concern?
• Have I clearly connected why this recommendation aligns with what they told me?', 3, 'active');

-- Pro Move 4036: Align recommendations with family priorities
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4036, 'doctor_why', 'When families hear their priorities reflected back in the plan, trust increases and resistance decreases. Alignment is not compromising standard of care; it''s framing clinically appropriate options through what the family values and being transparent when certain priorities cannot override medical necessity.', 0, 'active'),
(4036, 'doctor_script', 'Comfort: "Based on what you shared—that comfort is most important—I''d like to talk through sedation options…"

Minimizing treatment: "Since your priority is avoiding as much treatment as possible…"

Proactive: "Because you value being proactive…"

Efficiency: "Given that efficiency matters to you…"

Limits: "I want to honor what''s most important to you… there are times when certain medical needs still require us to recommend treatment…"

Close loop: "Does this approach feel like it aligns with what you told me matters most?"', 1, 'active'),
(4036, 'doctor_good_looks_like', '- Explicitly name the priority before recommending a plan
- Connect how the plan supports that priority
- Offer alternatives when possible that still meet standards
- Be transparent when priorities cannot override medical necessity
- Close the loop with an alignment check', 2, 'active'),
(4036, 'doctor_gut_check', '• Have I clearly reflected the family''s stated priority out loud?
• If I were the parent, would I recognize my concern in this recommendation?
• Am I framing this in terms of what matters to them—or what''s easiest for me?
• Have I explained how this plan supports their goal, not just the outcome?', 3, 'active');

-- Pro Move 4037: Offer safe sedation modalities
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4037, 'doctor_why', 'Families deserve a thoughtful sedation discussion based on safety and likelihood of success—not convenience. Not all modalities are appropriate for all children (behavior, airway, BMI, medical complexity). Explaining why an option is not appropriate builds trust and shows recommendations are safety-driven.', 0, 'active'),
(4037, 'doctor_script', 'Multiple options: "We have several safe sedation options…"

Some not appropriate: "I want to explain why certain sedation options aren''t a good fit…"

Only one: "I know it can feel limiting… my responsibility is to recommend what is safest and most likely to succeed…"', 1, 'active'),
(4037, 'doctor_good_looks_like', '- Review behavior/age/anxiety and ability to cooperate
- Assess medical history and airway risk and BMI
- Offer nitrous or oral sedation when appropriate
- Explain when lighter options are unsafe or unlikely to succeed
- Frame recommendation around safety, predictability, and child experience
- Document rationale when only one modality is appropriate', 2, 'active'),
(4037, 'doctor_gut_check', '• Is this modality safe and reasonably likely to succeed for this child?
• Would offering this option increase the risk of failure, trauma, or escalation mid-appointment?
• Have I clearly explained why certain options are not appropriate—not just that they aren''t offered?
• Would I be comfortable defending this sedation recommendation from a safety standpoint?', 3, 'active');

-- Pro Move 4038: Discuss options and arrive at clear plan before charting
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4038, 'doctor_why', 'Shared decision-making should not feel fragmented. The doctor leads the conversation, explains clinically appropriate options, checks for understanding and emotional alignment, and then arrives at one clear recommended plan. Charting should reflect the shared conclusion, not a list of unresolved possibilities.', 0, 'active'),
(4038, 'doctor_script', '"There are a few ways we can approach this. Based on what we''ve discussed and what matters most to you, this is the option I''d recommend."

Alignment check: "After talking this through, does this plan feel like it aligns with your goals for your child?"

Emotional check-in: "How are you feeling about that option?" / "What questions or concerns are still coming up for you?"', 1, 'active'),
(4038, 'doctor_good_looks_like', '- Present clinically appropriate options (not every theoretical option)
- Explain pros/cons and rationale for the recommended approach
- Pause to ensure family feels heard and informed
- Check for understanding and emotional alignment
- Arrive at one clear recommended plan before asking RDA to chart', 2, 'active'),
(4038, 'doctor_gut_check', '• Have I clearly led this conversation, or left the family feeling unsure?
• If another provider sees this chart, will the plan feel clear and intentional?
• Did I check how the family feels before finalizing the recommendation?
• Am I asking the RDA to chart clarity—or confusion?', 3, 'active');

-- Pro Move 4039: Ensure parent/RDA understand next appointment
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4039, 'doctor_why', 'Unclear next steps commonly cause missed appointments, delayed treatment, and parent frustration. Confirming the plan in the room ensures continuity, accurate scheduling, and a smooth handoff—and reinforces confidence in the care plan.', 0, 'active'),
(4039, 'doctor_script', '"Just to confirm, the next visit will be for treatment of the cavity we discussed, using nitrous oxide for comfort."

"The goal of the next appointment is to take care of this before it gets worse."

"We''re planning this to be done within the next few weeks—does that timing work for you?"

Close: "Does that plan make sense to you?" / "Anything about the next visit that feels unclear or concerning?"', 1, 'active'),
(4039, 'doctor_good_looks_like', '- Summarize the next appointment in plain language (what, why, when)
- State urgency/timing expectations clearly
- Confirm both parent and RDA heard the same plan
- Pause to invite questions before leaving the room', 2, 'active'),
(4039, 'doctor_gut_check', '• If I left right now, could this parent explain the next visit to someone else?
• Would the RDA schedule this appointment exactly as I intend?
• Have I clearly communicated urgency, duration, and expectations?
• Have I closed the loop—or just ended the conversation?', 3, 'active');

-- Pro Move 4040: Introduce AI and proactive philosophy
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4040, 'doctor_why', 'When families understand how diagnoses are formed, they''re more confident in recommendations. Introducing AI as a supporting tool (not a replacement for judgment) builds transparency and trust. Framing it within proactive care explains why early detection often enables less invasive options.', 0, 'active'),
(4040, 'doctor_script', '"We use AI-assisted imaging as an added layer of support to help us catch changes early and be as proactive as possible."

"The AI highlights areas for us to look more closely, but all diagnoses and recommendations come from me."

"Catching things early often allows us to use preventive options instead of waiting until treatment becomes more invasive."', 1, 'active'),
(4040, 'doctor_good_looks_like', '- Introduce AI briefly and matter-of-factly during the exam
- Position AI as adjunct to clinical expertise (support tool, not decision-maker)
- Avoid technical jargon or "salesy" tech talk
- Connect AI use to prevention, accuracy, and safety', 2, 'active');

-- Pro Move 4041: Pre-treatment check-in with comfort promise
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4041, 'doctor_why', 'Expectation-setting protects trust if plans change and supports trauma-informed care. Some procedures have uncertainty (pulp therapy/crowns/sedation). Preparing families for reasonable alternate outcomes and reaffirming comfort as the standard reduces surprise and improves psychological safety.', 0, 'active'),
(4041, 'doctor_script', 'Comfort promise: "Our promise to every child is that they will be safe and comfortable. If either of those things aren''t being accomplished… we stop and regroup."

Pulp/crown: "Most of the time that''s exactly what we''re able to do. Occasionally… it may need to be extracted. I want you to know that possibility ahead of time so nothing feels surprising."

Oral sedation: "Every child responds differently. If at any point he becomes overwhelmed or uncomfortable, my promise is that we stop and find another way forward."

Normalize: "Stopping isn''t a failure—it''s part of how we protect kids…"

Close: "Does that plan and our comfort promise make sense to you?"', 1, 'active'),
(4041, 'doctor_good_looks_like', '- Briefly review the planned procedure before starting
- Name realistic alternate outcomes before they happen (so changes don''t feel alarming)
- Set expectations around sedation success/comfort up front
- Emphasize guardrails: if not safe or not comfortable, you stop and regroup
- Invite questions; confirm understanding before proceeding', 2, 'active'),
(4041, 'doctor_gut_check', '• If the plan changes mid-procedure, will this family feel blindsided?
• Have I clearly explained both the goal and the guardrails of today''s treatment?
• Does this child know we will stop if they need us to?
• Am I protecting trust now—or reacting later?', 3, 'active');

-- Pro Move 4042: Consider trust impact before modifying agreed plan
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4042, 'doctor_why', 'Same-day plan changes can erode trust and create doubt in care consistency, even if well intentioned. The draft emphasizes distinguishing true safety concerns from personal discomfort; honoring prior plans when safe/clinically acceptable; explaining changes without undermining prior providers; escalating patterns to leadership instead of handling as one-offs chairside.', 0, 'active'),
(4042, 'doctor_script', 'Change necessary: "This is a change from what you expected today, so I want to take a moment to explain why."

"Based on what I''m seeing today, I want to talk through a different approach and make sure you understand the reasoning."

Honoring plan: "The plan you agreed to is still safe and reasonable, so I''m comfortable moving forward as planned today."

"We''ll proceed with the original plan, and I''ll be closely monitoring throughout."', 1, 'active'),
(4042, 'doctor_good_looks_like', '- Pause before changing a plan the family expected
- Ask: is the original plan safe/clinically acceptable, even if not your preference?
- Distinguish safety concern vs unfamiliarity/discomfort/inexperience
- If changing: explain rationale clearly without undermining prior provider
- If honoring: say so explicitly and proceed confidently
- If you see a pattern of "unsafe plans," escalate to leadership (systems-level), not chairside debate', 2, 'active'),
(4042, 'doctor_gut_check', '• Is this plan unsafe—or is it just unfamiliar or outside my comfort zone?
• Would I feel comfortable defending honoring the original plan from a safety standpoint?
• Am I changing this plan to protect the child—or to protect my own anxiety?
• If I were the parent, would this change feel thoughtful or destabilizing?
• Is this a one-off safety issue, or a systems issue I should escalate?
• Would honoring this plan today build more trust than changing it last minute?', 3, 'active');

-- Pro Move 4043: Provide anticipatory guidance early
INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status) VALUES
(4043, 'doctor_why', 'When families are prepared in advance for what is coming next, care feels intentional rather than reactive. Early expectation-setting normalizes future recommendations, reduces surprise or resistance, and builds trust across providers. It also supports continuity of care by reducing the chance that later recommendations feel sudden, inconsistent, or financially motivated.', 0, 'active'),
(4043, 'doctor_script', 'Infant: "At this age, we focus on prevention. Moving forward, we typically recommend fluoride varnish every six months…"

Around age 3: "Right now, we''re just visually monitoring. Around age four, we usually start taking X-rays…"

Around age 4–5: "In the next year or so, we''ll likely start talking about sealants…"

General: "I like to share this early so nothing ever feels surprising—we''ll always talk through it again when the time comes."', 1, 'active'),
(4043, 'doctor_good_looks_like', '- Introduce age-appropriate future recommendations as routine
- Use calm, educational language (not "selling")
- Reinforce consistency ("we''ll revisit when the time comes")
- Plant the seed early, then revisit later', 2, 'active'),
(4043, 'doctor_gut_check', '• What will this family need to understand before the next milestone visit?
• If another doctor sees this child next year, will today''s conversation help or hurt continuity?
• Have I normalized future recommendations, or will they feel sudden later?
• Would this recommendation feel surprising if I hadn''t mentioned it earlier?', 3, 'active');