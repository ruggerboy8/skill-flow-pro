-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260812203129

-- R2 learning content, part 1: moves 4044-4049.
select set_config('app.change_reason',
  'R2 Alex audit: learning content for new moves 4044-4049, drafted from Alex''s existing materials on 192, 196, and 197 in her established four-part format. Pending her review.', true);

insert into public.pro_move_resources (action_id, type, content_md, display_order, status) values

-- 4044: mid-appointment permission ask
(4044, 'doctor_why', $md$A good visit is a scarce resource. When a child is calm, comfortable, and tolerating treatment well, that window may not come again: the next visit means another day of missed school and work, another **sedation or nitrous event**, and another chance for cooperation to look different.

Asking the parent's **permission** honors their role in the decision while giving the family the gift of a visit they do not have to make. The ask matters as much as the treatment. Completing extra work without checking in, however well intentioned, can leave a parent feeling that something was decided for them.$md$, 0, 'active'),

(4044, 'doctor_script', $md$> "Johnny did great for these first two crowns. Would you be okay with us continuing and completing the other side today as well? If we can save you another visit and another nitrous appointment, I think that would be great."

> "He's tolerating everything really well, and we have the time today. If it's alright with you, I'd love to make the most of a good visit."

> "Totally understand. We'll stick with today's plan and take care of the rest at the next visit."$md$, 1, 'active'),

(4044, 'doctor_good_looks_like', $md$- Assess the child's **behavior, comfort, and tolerance** before considering additional treatment.
- Confirm that **time permits**: the schedule can absorb the additional treatment without harming other patients' experience.
- Ask the parent's **permission before proceeding**, framing the time, cost, and sedation savings plainly.
- Accept a decline gracefully and without pressure. The offer itself builds trust.
- Ensure the RDA is aligned on the revised plan before continuing.$md$, 2, 'active'),

(4044, 'doctor_gut_check', $md$- Did I evaluate the child's tolerance honestly, rather than pushing a tired child through more treatment?
- Did I check the schedule before offering, so that saying yes does not cost another family their experience?
- Did I ask permission rather than assuming, and frame the benefit in the family's terms?
- If I chose not to offer, was there a real reason, or did I miss a consolidation opportunity?$md$, 3, 'active'),

-- 4045: five-minute exams
(4045, 'doctor_why', $md$Exam time is the doctor's scarcest resource, and the entire schedule is built on it. Five **focused** minutes, delivered consistently, is what keeps every other family's wait short.

The five minutes are not about rushing. Families remember whether the doctor felt **present and attentive**, not how long the doctor stayed. A prepared, focused exam actually feels more attentive than a long, wandering one, because every minute of it is spent on them.$md$, 0, 'active'),

(4045, 'doctor_script', $md$> "Here's what I'm seeing today, and here's what I'd recommend. Jenni will walk you through the details and get you scheduled. You're in great hands."

> "Great questions. Jenni knows this inside and out and will take good care of you."$md$, 1, 'active'),

(4045, 'doctor_good_looks_like', $md$- Enter the room already briefed by the RDA, so exam time is spent examining rather than orienting.
- Perform a focused, thorough exam and give the parent a clear, purposeful summary.
- Hand off follow-up details to the RDA confidently.
- Stay warm and unhurried in manner even while being efficient in fact.$md$, 2, 'active'),

(4045, 'doctor_gut_check', $md$- Did my exams today stay near five minutes of doctor time?
- When one ran long, what pulled it long, and did it meaningfully impact care?
- Did I use the RDA's preparation, or re-do work that was already done?
- Did the family experience focus, or hurry?$md$, 3, 'active'),

-- 4046: nitrous 20 minutes
(4046, 'doctor_why', $md$Nitrous gives a **limited cooperation window**. Beyond roughly 20 minutes of treatment time, a child's tolerance falls, the experience degrades, and the appointment begins costing more than it delivers: for the child, for the family's confidence, and for the schedule.

The time boundary is really a **planning** discipline. Procedures are chosen and sequenced to fit the window, rather than the window stretched to fit the plan.$md$, 0, 'active'),

(4046, 'doctor_script', $md$> "We got the most important tooth taken care of today, and he did beautifully. We'll take care of the other side at the next visit while he still has a great experience to remember."$md$, 1, 'active'),

(4046, 'doctor_good_looks_like', $md$- Plan procedures that realistically fit within 20 minutes of treatment time.
- Ensure the room and setup allow treatment to begin promptly once nitrous is effective.
- Stay aware of elapsed treatment time during the appointment.
- Defer remaining treatment rather than pushing a struggling child past the window.$md$, 2, 'active'),

(4046, 'doctor_gut_check', $md$- Did today's nitrous appointments stay within 20 minutes of treatment time?
- When one ran over, was it a clinical surprise or a planning miss?
- Am I scoping nitrous visits to what the modality can actually support?
- Did any child's experience degrade because I tried to finish rather than pause?$md$, 3, 'active'),

-- 4047: oral sedation 40 minutes
(4047, 'doctor_why', $md$Oral sedation has a **depth and duration window**, and working past it trades safety margin and the child's experience for a few more minutes of production.

Forty minutes of treatment time is the discipline that keeps sedation visits **predictable**: the child recovers well, the parent's trust is intact, and the schedule holds. Like the nitrous boundary, it is enforced at the treatment-planning stage, not by the clock alone.$md$, 0, 'active'),

(4047, 'doctor_script', $md$> "We completed everything we planned for the lower right, and that was the priority. She's had a long appointment, so we'll stop here and finish the other side at her next visit."$md$, 1, 'active'),

(4047, 'doctor_good_looks_like', $md$- Scope sedation visits, typically one quadrant of involved treatment, to fit within 40 minutes of treatment time.
- Sequence the most important treatment first, so that a pause never sacrifices the priority.
- Monitor the child's sedation level and comfort against elapsed time.
- Stop or defer rather than working past the window, and explain the reasoning to the parent.$md$, 2, 'active'),

(4047, 'doctor_gut_check', $md$- Did my sedation appointments stay within 40 minutes of treatment time?
- Was the visit scoped to the window when it was planned, or was I hoping to fit it in?
- Did I front-load the most important treatment?
- Would I feel comfortable defending the length of today's longest sedation visit?$md$, 3, 'active'),

-- 4048: purposeful parent conversations
(4048, 'doctor_why', $md$Parent conversation is some of the **highest-value time** in the visit. It is where trust, understanding, and case acceptance actually happen, which is exactly why it deserves protection.

A conversation that drifts stops serving the family in front of you and starts costing the next one. **Warm redirection** is a genuine skill: the parent should feel they had the doctor's full attention, and the conversation should still land where the child's care needs it to.$md$, 0, 'active'),

(4048, 'doctor_script', $md$> "I want to make sure we focus on the most important things for your child's care today."

> "That's a great question for Jenni, and she'll take good care of you on it. Before I head to my next patient, let me make sure the plan is clear for you."

> "I want to give that the attention it deserves. Let's make sure we get the treatment plan settled first, and then Jenni can follow up with you on the rest."$md$, 1, 'active'),

(4048, 'doctor_good_looks_like', $md$- Give the parent genuine, undivided attention while the conversation serves the child's care.
- Notice drift early and redirect with warmth rather than abruptness.
- Close every conversation with a clear next step.
- Make families feel heard in less time, not less heard in the same time.$md$, 2, 'active'),

(4048, 'doctor_gut_check', $md$- Did my parent conversations today meaningfully impact care?
- When one drifted, did I redirect warmly, or let it run while the schedule slipped?
- Did the parent leave the conversation feeling heard?
- Would another family have been negatively impacted by my longest conversation today?$md$, 3, 'active'),

-- 4049: clearing the floor before stepping away
(4049, 'doctor_why', $md$The clinical floor runs on the doctor's **availability**. When the doctor steps away with loose ends, patients wait numbed, teams stall mid-procedure, and the schedule quietly falls behind: not because anyone is slow, but because everything doctor-dependent stops at once.

Stepping away is fine and necessary. Stepping away **clean** is the discipline. It also signals to the team that their time, and the patients' time, is respected.$md$, 0, 'active'),

(4049, 'doctor_script', $md$> "Before I step into the office for a few minutes: is anything waiting on me? Any checks coming up?"

> "I'll be in the office for about ten minutes. Grab me the moment the hygiene check is ready."

> "Everyone taken care of? Anything you need from me before I step out?"$md$, 1, 'active'),

(4049, 'doctor_good_looks_like', $md$- Scan for waiting exams, hygiene checks, and anesthetized patients before leaving the floor.
- Confirm the team has direction and materials for what happens while you are away.
- Tell the team where you will be and when you will be back.
- Time office work to genuine lulls, and return promptly when called.$md$, 2, 'active'),

(4049, 'doctor_gut_check', $md$- Is anyone, patient or teammate, waiting on me right now?
- Did I check the floor before I left it, or find out afterward?
- Does the team know where I am and when I am back?
- Am I stepping away during a lull, or creating one?$md$, 3, 'active');