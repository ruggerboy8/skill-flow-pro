// Seed data for the Facilitator Presentation tool (v1).
//
// NOTE: pro moves, journey content, and questions are seeded here for the first build so the
// UI/design can be finalized. The live wiring (week's pro moves for a role from weekly_plan /
// weekly_assignments at the facilitator's location, and a question-of-the-day table) is the
// immediate follow-up. Keep this module as the single swap-in point.

export type Role = "RDA" | "DFI" | "OM";
export type MeetingType = "in" | "out";

export type Domain = "Clinical" | "Clerical" | "Cultural" | "Case Acceptance";

export interface ProMove {
  domain: Domain;
  statement: string;
  hasScript: boolean;
}

// Maps our four domains to the app's CSS custom properties (see src/index.css).
export const domainVar: Record<Domain, string> = {
  Clinical: "--domain-clinical",
  Clerical: "--domain-clerical",
  Cultural: "--domain-cultural",
  "Case Acceptance": "--domain-case-acceptance",
};

// The confidence/performance scale, verbatim from src/components/NumberScale.tsx.
export const scale: { n: number; text: string }[] = [
  { n: 4, text: "I am a master and do it all the time." },
  { n: 3, text: "I do this 95% of the time." },
  { n: 2, text: "I have some room for improvement here." },
  { n: 1, text: "I rarely do this or didn't know I should have been doing it." },
];

export const roleLabels: Record<Role, string> = {
  RDA: "RDA",
  DFI: "DFI",
  OM: "Office Manager",
};

// Representative week's pro moves per role (seed).
export const proMovesByRole: Record<Role, ProMove[]> = {
  RDA: [
    { domain: "Clinical", statement: "I always use Tell, Show, Do before each step on the patient.", hasScript: true },
    { domain: "Cultural", statement: "I always greet the patient by name in the lobby and walk them back myself.", hasScript: false },
    { domain: "Case Acceptance", statement: "I always give the doctor a warm handoff in the room, in front of the family.", hasScript: true },
  ],
  DFI: [
    { domain: "Cultural", statement: "I always stand up to greet every family by name with eye contact.", hasScript: false },
    { domain: "Clerical", statement: "I always confirm paperwork verbally before marking a patient checked in.", hasScript: false },
    { domain: "Case Acceptance", statement: "I always preview the doctor by name with one specific positive detail.", hasScript: true },
  ],
  OM: [
    { domain: "Cultural", statement: "I always model the welcome standard on the floor each morning.", hasScript: false },
    { domain: "Clerical", statement: "I always walk the team through the day's huddle board.", hasScript: false },
    { domain: "Clinical", statement: "I always close the loop on any patient-flow delay over ten minutes.", hasScript: false },
  ],
};

// Patient journey stages (seed from the handoff doc; clinical director refines later).
export interface JourneyStage {
  name: string;
  roles: string;
  description: string;
  proMovesByRole: Record<Role, string[]>;
}

export const journeyStages: JourneyStage[] = [
  {
    name: "Check-in",
    roles: "Front desk",
    description:
      "The family arrives. We greet by name, offer hospitality, confirm paperwork, and preview the doctor before they ever sit down.",
    proMovesByRole: {
      DFI: ["Stand to greet by name", "Offer hospitality before other tasks", "Preview the doctor warmly"],
      RDA: ["Be ready for a fast, warm pull-back"],
      OM: ["Model the welcome standard"],
    },
  },
  {
    name: "To the chair",
    roles: "Front desk to assistant",
    description:
      "The assistant comes to the lobby to collect the patient personally, by name, within ten minutes. No names shouted down the hall.",
    proMovesByRole: {
      RDA: ["Greet the patient by name in the lobby", "Walk them back yourself"],
      DFI: ["Notify the clinical team right after check-in"],
      OM: ["Coach the under-ten-minute pull-back"],
    },
  },
  {
    name: "The chair",
    roles: "Assistant + doctor",
    description:
      "Tell, Show, Do before each step. A warm handoff to the doctor happens in the room, in front of the family, and they leave with a clear, agreed plan.",
    proMovesByRole: {
      RDA: ["Tell, Show, Do before each step", "Warm handoff in the room"],
      DFI: [],
      OM: ["Spot-check for the warm handoff"],
    },
  },
  {
    name: "To checkout",
    roles: "Assistant to front desk",
    description:
      "Post-op instructions are given, a summary reaches the front desk before the family does, and the assistant walks the family up by name.",
    proMovesByRole: {
      RDA: ["Give clear post-op instructions", "Walk the family to checkout by name"],
      DFI: ["Be ready with the treatment summary"],
      OM: ["Audit the handoff to front desk"],
    },
  },
  {
    name: "Checkout",
    roles: "Front desk",
    description:
      "We schedule the next visit first, explain any balance with empathy, and end with a genuine, personalized goodbye.",
    proMovesByRole: {
      DFI: ["Schedule the next visit first", "Explain any balance with empathy", "Personal goodbye by name"],
      RDA: [],
      OM: ["Audit the goodbye standard"],
    },
  },
];

// Question-of-the-day seed set. v1 starter; expand toward ~150-200 (or move to a table).
export const icebreakers: string[] = [
  "What is a small win you had this weekend?",
  "If you could instantly master one skill, what would it be?",
  "What is your go-to comfort meal after a long day?",
  "Who made your week a little better recently?",
  "What is a tiny thing that always makes you smile?",
  "What are you looking forward to this month?",
  "What is the best advice you have gotten lately?",
  "If you could have any superpower for one day, what would it be?",
  "What is a song you cannot help but sing along to?",
  "What is your favorite way to unwind after work?",
  "What is something new you tried recently?",
  "Who is someone you admire, and why?",
  "What is your favorite local spot to eat?",
  "What is a hobby you wish you had more time for?",
  "What is the best vacation you have ever taken?",
  "What is a show or book you would recommend right now?",
  "What is your favorite season, and why?",
  "What is a goal you are working toward this year?",
  "What made you laugh recently?",
  "If you could swap jobs with anyone for a day, who would it be?",
  "What is your favorite thing about working here?",
  "What is a small act of kindness you noticed lately?",
  "What is your favorite way to spend a day off?",
  "What is something you are proud of this week?",
  "What is a tradition your family has that you love?",
  "If you could travel anywhere tomorrow, where would you go?",
  "What is a skill you are surprisingly good at?",
  "What is your favorite kind of weather?",
  "What is the best meal you have had recently?",
  "If you could live in any decade, which would you pick?",
  "What is a small thing a coworker did that you appreciated?",
  "What is your favorite holiday and why?",
  "What is something on your bucket list?",
  "What is a movie you could watch over and over?",
  "What is your favorite way to start the morning?",
  "Who would you want to play you in a movie?",
  "What is a smell that brings back a good memory?",
  "What is the last thing that made you really laugh?",
  "What is a place you would love to visit someday?",
  "What is your go-to karaoke song?",
  "What is a small luxury you treat yourself to?",
  "What is something you learned the hard way?",
  "What is your favorite thing to do with family?",
  "What is a cause you care about?",
  "What is the best concert or event you have been to?",
  "What is a food you could never give up?",
  "What is your favorite childhood TV show?",
  "What is a goal you are proud to have reached?",
  "What is your favorite season for food?",
  "If you had an extra hour today, how would you spend it?",
  "What is a compliment you received that stuck with you?",
  "What is your favorite board or card game?",
  "What is something you are curious to learn more about?",
  "What is a place that feels like home to you?",
  "What is your favorite kind of music to work to?",
  "What is a habit you are proud of building?",
  "What is the best gift you have ever given?",
  "What is your favorite animal and why?",
  "What is a book that changed how you think?",
  "What is your favorite way to celebrate a win?",
  "What is something simple that improved your day recently?",
  "What is a trip you would take if money were no object?",
  "What is your favorite local hidden gem?",
  "Who taught you something important, and what was it?",
  "What is a tradition you want to start?",
  "What is your favorite kind of weather to work in?",
  "What is something you are looking forward to this week?",
  "What is a hobby you picked up recently?",
  "What is your favorite comfort show to rewatch?",
  "What is a moment from this week you are grateful for?",
  "What is your favorite way to recharge?",
  "What is a goal you have for this quarter?",
];
