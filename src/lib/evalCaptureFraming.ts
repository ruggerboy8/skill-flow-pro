/**
 * Per-role, per-domain framing for the rebuilt evaluation capture flow.
 *
 * Source of truth (for now): this module, seeded from
 * docs/features/evaluation-capture-stems.md. Summaries are third person
 * ("they" / "this team member") and prompt the EVALUATOR to recall what they
 * observed. The starter stems are second person ("you") -- the evaluator's
 * words to the staff member -- and are shared across all roles and domains.
 *
 * Owner will do a finer wording pass after the feature is built. When an
 * in-app editor exists, these summaries should migrate to a
 * `domain_role_summaries` table; until then this constant is the fastest
 * non-breaking home. The competencies and Pro Moves themselves come from the
 * live data (evaluation_items + pro_moves), not from here.
 */

export const DOMAIN_IDS = {
  Clinical: 1,
  Clerical: 2,
  Cultural: 3,
  CaseAcceptance: 4,
} as const;

export type DomainId = (typeof DOMAIN_IDS)[keyof typeof DOMAIN_IDS];

/** roleId -> domainId -> third-person summary shown to the evaluator. */
export const DOMAIN_SUMMARIES: Record<number, Record<number, string>> = {
  // Front Desk
  1: {
    1: "In Clinical, they are the front desk's bridge to the clinical team. They keep patients moving, alerting the back the moment someone is ready and flagging anyone waiting more than ten minutes; they hand off clean information; they adapt the schedule when emergencies or delays hit; and they know common procedures well enough to speak to them with confidence.",
    2: "In Clerical, they run the front-desk machinery. They balance phones, texts, and the guest in front of them without dropping any of them; they keep records and paperwork accurate before check-in; they work the schedule days ahead to confirm visits and fill open slots; and they keep the front area clean, stocked, and welcoming.",
    3: "In Cultural, they set how families feel. They greet every patient and guardian warmly and by their preferred name, build trust by asking about their goals, deliver hard policy and balance conversations with both kindness and firmness, and stay calm and accountable when they receive critical feedback.",
    4: "In Case Acceptance, they help families say yes to care. They explain treatment and finances clearly, using estimated benefits and patient portion rather than covered or not; they build the doctor's and the practice's credibility; they handle objections about cost or x-rays with confidence instead of pressure; and they smooth the path through portal and paperwork.",
  },
  // Dental Assistant
  2: {
    1: "In Clinical, they are the doctor's hands chairside. They chart accurately as the doctor calls findings, anticipate the next instrument before it is asked for, run tell-show-do and watch closely for a patient's comfort and anxiety, present the patient cleanly when the doctor enters, and keep the room sterile and reset between patients.",
    2: "In Clerical, they keep the chair on schedule and the record clean. They confirm consent forms and the authorized adult before starting, move patient status in real time, resequence chairs and flag the Lead RDA when running behind, verify medical history, draft clinical notes before the patient leaves, schedule recare while the patient is in-chair, and stay on top of Uptime tasks and disposables.",
    3: "In Cultural, they make the chair feel safe. They greet the patient by name with eye contact, read the parent's and patient's mood, offer comfort like a blanket or headset, give the patient a hand-raise to pause, ask a curious open-ended question, reinforce attendance kindly, and stay calm and resolution-focused when a parent is frustrated.",
    4: "In Case Acceptance, they help families understand and accept care. After the doctor leaves the chair they check for comprehension and ask how the plan sounds, identify the real concern behind a hesitation (comfort, time, or cost), link treatment to the parent's goals for their child, preview the doctor and OVERJET to build credibility, use estimated-benefits language, and make sure the next visit is scheduled at the right interval.",
  },
  // Office Manager
  3: {
    1: "In Clinical, their role is oversight, not chairside. Each week they review clinical-equipment Uptime tasks with the Lead RDA, observe the RDA-to-doctor hand-off and document an opportunity to coach, and verify Pro Move meeting attendance, following up with anyone who missed.",
    2: "In Clerical, they run the operational engine. They review last week's KPIs every Monday and send the Regional Manager an action plan, work uncollected balances and claim flags daily, reconcile the production report, dig into the root cause of recurring flags and coach the fix at huddle, and make sure phones are answered in three rings and every visit inside 48 hours is confirmed.",
    3: "In Cultural, they set the tone for the office. They walk the floor twice a day with specific encouragement, stay aware of the room's mood and reset it or address tension directly, personally follow up on any escalated parent concern by the end of the next day, and make sure the week's social content reaches marketing.",
    4: "In Case Acceptance, they own the financial conversation and model the standard. They use estimated-benefits and family-contribution language, respond to financial concerns with clear options like staging treatment or CareCredit, personally complete a full over-the-top check-in with at least one family a day so the team sees the bar, and submit preauthorization within 48 hours while reviewing approvals daily.",
  },
};

/** You-voice starter stems. Glow names a behavior and its impact; Grow points forward to a next step. */
export const GLOW_STEMS: string[] = [
  "You consistently [behavior], and it shows in [impact]...",
  "One of your real strengths is the way you...",
  "I noticed how you [specific moment] -- families clearly felt...",
];

export const GROW_STEMS: string[] = [
  "You're already strong at ...; the next level is to...",
  "One opportunity this quarter: when ..., try...",
  "I'd love to see you ..., especially when...",
  "A small shift that would make a big difference: ...",
];

/** Returns the third-person summary for a role+domain, or null if not yet authored. */
export function getDomainSummary(roleId: number, domainId: number): string | null {
  return DOMAIN_SUMMARIES[roleId]?.[domainId] ?? null;
}
