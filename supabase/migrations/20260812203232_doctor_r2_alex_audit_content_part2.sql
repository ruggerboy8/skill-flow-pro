-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260812203232

-- R2 learning content, part 2: moves 4050-4055 and restorations 4007, 4040, 4041.
select set_config('app.change_reason',
  'R2 Alex audit: learning content for new moves 4050-4055 and the three restored moves, drafted from Alex''s existing materials on 4033, 4035, 4036, 4037, 4038, and 4039 in her established four-part format. Pending her review.', true);

insert into public.pro_move_resources (action_id, type, content_md, display_order, status) values

-- 4050: teach-back
(4050, 'doctor_why', $md$Parents routinely leave treatment conversations with a **partial or different understanding** than the doctor believes was communicated. The gap surfaces later as confusion, missed appointments, or quietly declined care.

Asking the parent to say the plan back, framed as a check on **the doctor's explaining** rather than a quiz of the parent, catches the gap in the one moment it is cheap to fix: while everyone is still in the room and the RDA can still chart it correctly.$md$, 0, 'active'),

(4050, 'doctor_script', $md$> "I know that was a lot of information. Before we wrap up, I just want to make sure we're on the same page. What's your understanding of the plan from here?"

> "That's exactly right, and thank you for walking me through it. One thing I want to add so it's completely clear..."

> "That's my fault for not explaining it well. Let me try that part again."$md$, 1, 'active'),

(4050, 'doctor_good_looks_like', $md$- Invite the parent to state their understanding after every treatment plan conversation.
- Frame the request as checking your own communication, never as testing the parent.
- Listen to the whole answer without interrupting.
- Fill gaps warmly, then confirm the corrected understanding.
- Ensure the RDA hears the final version, so the charted plan matches the spoken one.$md$, 2, 'active'),

(4050, 'doctor_gut_check', $md$- Did I ask for the parent's understanding, or settle for "any questions?"
- Could this parent explain the plan accurately to a co-parent tonight?
- When a gap surfaced, did I treat it as my explaining to improve?
- Did the RDA hear the same final plan the parent did?$md$, 3, 'active'),

-- 4051: permission to push back
(4051, 'doctor_why', $md$Many parents will not voice doubts to a doctor unless they are invited to. They nod in the room and then **vote with the schedule**, cancelling or never booking.

Explicit permission to push back moves the objection into the room, where it can actually be addressed. It also communicates that the recommendation is confident enough to withstand questions. Parents who feel **ownership** of a decision are the ones who follow through on it.$md$, 0, 'active'),

(4051, 'doctor_script', $md$> "You know your child and your family best. If this recommendation doesn't feel like the right direction for you, let me know so we can talk through alternatives together."

> "I'd rather hear a concern now than have you leave unsure about it."

> "That's a fair question, and I'm glad you asked it. Let me explain why I landed where I did."$md$, 1, 'active'),

(4051, 'doctor_good_looks_like', $md$- Offer the invitation out loud after the recommendation, not only when hesitation appears.
- Watch for nonverbal hesitation and gently extend the invitation again.
- Receive pushback with curiosity rather than defensiveness.
- Talk through alternatives honestly, including where clinical needs limit the options.$md$, 2, 'active'),

(4051, 'doctor_gut_check', $md$- Did I say the invitation out loud, or assume the parent felt free to disagree?
- Did any hesitation in the room go uninvited and unexplored?
- When a parent pushed back, did I get curious or defensive?
- Would this parent feel safe telling me no?$md$, 3, 'active'),

-- 4052: declined treatment
(4052, 'doctor_why', $md$A decline met with pressure ends the conversation. A decline met with **curiosity** keeps the relationship.

Repeating the parent's decision back, neutrally and without editorializing, shows they have been heard rather than judged. The open question that follows usually surfaces the real driver: **fear, cost, a past experience, or a misunderstanding**, and most of those are addressable once they are spoken aloud.

Whatever the outcome, the recommendation, the discussion, and the informed refusal are documented before the family leaves.$md$, 0, 'active'),

(4052, 'doctor_script', $md$> "I'm hearing you say that you're not inclined to move forward with this plan. Can I ask you to tell me a little more about that?"

> "Can you tell me more about what's making this feel hard right now?"

> "That makes sense, and I appreciate you sharing it. Here's what I want to make sure you know about what we can and cannot catch by watching it."

> "We completely respect you making decisions that feel right for your family. I'll document what we discussed today so we both have a clear record."$md$, 1, 'active'),

(4052, 'doctor_good_looks_like', $md$- Repeat the parent's decision back in neutral language before responding to it.
- Ask one curious, open-ended question, then listen to the whole answer.
- Address the actual concern that surfaces rather than re-arguing the plan.
- Explain plainly what monitoring can and cannot catch.
- Document the recommendation, the discussion, and the informed refusal before the family leaves.$md$, 2, 'active'),

(4052, 'doctor_gut_check', $md$- Did I repeat their decision without pressure or editorializing?
- Did I ask and then actually listen, or ask and then re-pitch?
- Did I learn the real reason behind the decline?
- Is the informed refusal documented, and did the parent leave feeling respected?$md$, 3, 'active'),

-- 4053: cost as a barrier, discovery
(4053, 'doctor_why', $md$Cost is the most common **unspoken** driver of declined and delayed care, and families rarely raise it twice. When a parent signals it once, meeting that signal directly and without judgment turns an awkward subject into **planning information**.

Asking about budget respects the family's reality. Asking whether they want to see every option respects their **autonomy**. Some families want only what is covered; others would gladly consider more and are never offered the chance. The only way to know is to ask.$md$, 0, 'active'),

(4053, 'doctor_script', $md$> "I'm really glad you mentioned that. Would it help to talk through this with your budget in mind? Is there a number we should be mindful of?"

> "Some families want to see every option we'd recommend, even ones insurance may not fully cover. Others prefer to start with what's covered. Which would be more helpful for you?"

> "Thank you for telling me. That helps me put together a plan that actually works for your family."$md$, 1, 'active'),

(4053, 'doctor_good_looks_like', $md$- Treat a cost signal as information to work with, never as something to gloss past.
- Ask the budget question plainly and warmly.
- Ask whether the family wants to see all options, including those insurance may not cover.
- Make no assumptions from appearance, insurance type, or payment history.
- Carry the answers into how the plan is framed and sequenced.$md$, 2, 'active'),

(4053, 'doctor_gut_check', $md$- When cost came up today, did I engage it directly or move past it?
- Did I ask rather than assume what this family could manage or wanted to see?
- Was there any judgment, spoken or felt, in how I asked?
- Did the plan conversation actually use what the family told me?$md$, 3, 'active'),

-- 4054: cost as a barrier, response
(4054, 'doctor_why', $md$How the doctor handles the cost moment decides whether the family leaves with a **path or a dead end**.

Acknowledgment without judgment preserves the family's dignity. Naming the clinically sound alternatives, and being honest about which options do not change safety or outcome, restores their sense of **agency** without compromising the standard of care.

The **personal handoff** matters as much as the alternatives. "The front desk can help you" reads as a dismissal; a warm introduction by name is a plan.$md$, 0, 'active'),

(4054, 'doctor_script', $md$> "I completely understand, and I'm glad you told me. There are a couple of clinically sound ways we could approach this that change the cost picture. Let me walk you through them."

> "I want to be straight with you: this part is not somewhere I'd recommend economizing, because it affects how long the treatment lasts. But here is where we do have real flexibility."

> "I'd also like to introduce you to Sarah, our treatment coordinator. She can put real numbers to each option and talk through what works for your family."$md$, 1, 'active'),

(4054, 'doctor_good_looks_like', $md$- Acknowledge the concern warmly the moment it is raised.
- Name which clinically sound alternatives change the cost picture, and be honest about which do not.
- Never present an option that compromises care as a cost fix.
- Walk the family to the treatment coordinator, or bring the coordinator in, by name.
- Confirm the family leaves with a concrete next step, not just sympathy.$md$, 2, 'active'),

(4054, 'doctor_gut_check', $md$- Did I acknowledge the concern without a flicker of judgment?
- Were the alternatives I named genuinely clinically sound?
- Did I make a personal connection to the coordinator, or wave toward the front desk?
- Did this family leave with a workable path?$md$, 3, 'active'),

-- 4055: naming overwhelm
(4055, 'doctor_why', $md$An overwhelmed parent has **stopped absorbing information**, and decisions made in that state do not hold. They resurface later as cancellations, no-shows, and second-guessing.

Naming the moment pauses the clinical download and lowers the temperature. The naming stays **vague about the emotion** on purpose: "this might be a lot" lands whether the parent is anxious, upset, or simply processing, while a precise label that misses the mark ("I can see you're scared") feels invalidating and puts the parent on the defensive.

Normalizing tells the parent their reaction is acceptable. The open question hands them the floor.$md$, 0, 'active'),

(4055, 'doctor_script', $md$> "I can see this might be a lot to take in, and that's completely normal. Can you tell me a little about what's going through your mind?"

> "I can see that something about this isn't sitting quite right with you. Can you tell me a little about what's going through your mind?"

> "Most parents feel that way when they hear this much at once. Take your time."$md$, 1, 'active'),

(4055, 'doctor_good_looks_like', $md$- Watch for the signals: silence, a glazed look, rapid-fire questions, a change in posture.
- Pause the clinical content. More information is the wrong medicine in this moment.
- Name what you are noticing tentatively, without labeling a specific emotion.
- Normalize the reaction in the same breath.
- Ask an open question, then wait through the silence.
- Resume the plan conversation only once the parent has re-engaged.$md$, 2, 'active'),

(4055, 'doctor_gut_check', $md$- Did I notice the overwhelm, or plow ahead with the plan?
- Was my naming tentative and emotion-vague, or did I tell the parent what they were feeling?
- Did I normalize before questioning?
- Did I actually pause the clinical content and wait, and had the parent re-engaged before I resumed?$md$, 3, 'active'),

-- 4007 restored: caries risk assessment
(4007, 'doctor_why', $md$Caries risk is the **hinge** of preventive dentistry. It determines radiograph frequency, preventive strategy, and recall interval.

When risk is not charted, those decisions still get made, but without a documented basis, and our risk-based imaging standard ends up resting on data nobody wrote down. A charted assessment makes the reasoning **visible**: to the doctor at the next visit, to any colleague who sees the child, and to the parent who wants to know why we recommend what we recommend.$md$, 0, 'active'),

(4007, 'doctor_script', $md$> "Based on what we're seeing today, your child is at higher risk for cavities right now. That means we'll want to check with X-rays a little more often and be more proactive with things like fluoride, so we catch anything early."

> "Good news: everything we're seeing puts your child at low risk, so we can be more conservative with X-rays going forward."$md$, 1, 'active'),

(4007, 'doctor_good_looks_like', $md$- Chart a caries risk assessment for every patient, new and recall alike.
- Update the assessment when findings change, rather than letting an old status ride.
- Let the charted risk visibly drive radiograph interval, preventive plan, and recall timing.
- Chart it so a colleague could find the child's risk status and understand the basis at a glance.$md$, 2, 'active'),

(4007, 'doctor_gut_check', $md$- Did I chart a risk assessment for every patient I saw today?
- Does each charted risk status match what I actually saw in the chair?
- Did my radiograph and prevention decisions follow from the charted risk?
- Could a colleague pick up this chart and know the child's risk, and why?$md$, 3, 'active'),

-- 4040 restored: AI technology and philosophy
(4040, 'doctor_why', $md$Parents cannot see what the doctor sees on a radiograph, so trust in the diagnosis is really trust in the **process**.

A brief, natural mention that AI technology reviews every X-ray alongside the doctor, like a second set of eyes, makes that process visible and explains **why we catch things early**. It also establishes the practice's proactive philosophy before the first finding is ever presented, so that an early-treatment recommendation lands as "this is how we practice" rather than as an upsell.$md$, 0, 'active'),

(4040, 'doctor_script', $md$> "One thing we do here that I really value: every X-ray gets reviewed by AI technology alongside my own eyes. It's like a second opinion built into every visit, and it helps us catch things early, which is exactly how we like to practice: proactive rather than wait-and-see."

> "Let me show you what I'm seeing here, so you can see it too."$md$, 1, 'active'),

(4040, 'doctor_good_looks_like', $md$- Work the introduction naturally into the exam: 15 to 30 seconds, never a lecture.
- Connect the technology to the philosophy of proactive care and early detection.
- Show the finding on screen when it helps the parent see what you see.
- Mention it before findings are presented, so the framing is already in place.$md$, 2, 'active'),

(4040, 'doctor_gut_check', $md$- Did I introduce the technology and our philosophy during today's exams?
- Was it brief and natural, or a detour?
- Did I connect it to proactive care, rather than leaving it as a gadget mention?
- Would this parent leave able to explain how our practice approaches early detection?$md$, 3, 'active'),

-- 4041 restored: next appointment clarity
(4041, 'doctor_why', $md$Most broken treatment plans do not break in the operatory. They break **between rooms**. The parent hears one thing, the RDA schedules another, and weeks later a confused family misses an appointment nobody quite agreed on.

Stating the next appointment plainly, with the parent and the RDA both present, makes the handoff **predictable**: the parent can repeat it, the RDA can schedule it exactly, and the plan survives the walk to the front desk.$md$, 0, 'active'),

(4041, 'doctor_script', $md$> "So the next visit will be the two crowns on the lower right, with oral sedation, ideally within the next few weeks. Jenni will get that scheduled with you before you head out."

> "Anything about that next appointment that feels unclear or concerning?"$md$, 1, 'active'),

(4041, 'doctor_good_looks_like', $md$- State the next appointment's purpose, treatment, sedation plan, and rough timing before leaving the room.
- Say it while both the parent and the RDA are present and listening.
- Confirm the RDA knows exactly what to schedule.
- Invite the parent's questions about the next visit specifically.$md$, 2, 'active'),

(4041, 'doctor_gut_check', $md$- Could this parent explain the next appointment to someone else tonight?
- Will the RDA schedule exactly what I intend, without guessing?
- Did I say the timing out loud?
- Did I close the loop in the room, or leave it to the front desk to reconstruct?$md$, 3, 'active');