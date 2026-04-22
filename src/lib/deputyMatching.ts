// Shared name-matching utilities for Deputy employee → SFP staff mapping.
// Used by both the Deputy wizard and the Invite User dialog so suggestions
// are consistent across surfaces.

export interface DeputyEmployee {
  deputy_employee_id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  active: boolean;
}

export interface MatchableStaff {
  id?: string;
  name: string;
  email: string | null;
}

// Credentials & honorifics to strip from display names before comparing.
const CREDENTIAL_RE =
  /\b(dr|drs|prof|mr|mrs|ms|miss|dds|dmd|md|do|phd|rdh|rdha|rda|cda|da|om|oms|fagd|faap|facd|mph|mba|jr|sr|ii|iii|iv)\b\.?/gi;

// Common English nicknames → canonical first name.
const NICKNAMES: Record<string, string> = {
  alex: "alexander", al: "albert", andy: "andrew", tony: "anthony", abby: "abigail",
  ben: "benjamin", bill: "william", billy: "william", bob: "robert", bobby: "robert",
  cathy: "catherine", kathy: "catherine", chris: "christopher", dan: "daniel", danny: "daniel",
  dave: "david", deb: "deborah", debbie: "deborah", don: "donald", ed: "edward",
  eddie: "edward", fred: "frederick", greg: "gregory", jim: "james", jimmy: "james",
  jen: "jennifer", jenny: "jennifer", jess: "jessica", joe: "joseph", joey: "joseph",
  jon: "jonathan", kate: "katherine", katie: "katherine",
  ken: "kenneth", kenny: "kenneth", liz: "elizabeth", beth: "elizabeth", betty: "elizabeth",
  matt: "matthew", mike: "michael", mickey: "michael", nate: "nathan", nick: "nicholas",
  pat: "patrick", patty: "patricia", pete: "peter", rich: "richard", rick: "richard",
  rob: "robert", ron: "ronald", sam: "samuel", steve: "steven", sue: "susan",
  tom: "thomas", tommy: "thomas", will: "william", zach: "zachary",
};

function canonicalToken(t: string): string {
  return NICKNAMES[t] ?? t;
}

export function normalizeName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(CREDENTIAL_RE, " ")
    .replace(/[.,'’"()_/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokens(n: string): string[] {
  return normalizeName(n)
    .split(" ")
    .filter((t) => t.length > 1)
    .map(canonicalToken);
}

export type MatchConfidence = "exact" | "strong" | "weak" | "none";

export interface SuggestionResult {
  employee: DeputyEmployee | null;
  confidence: MatchConfidence;
}

/**
 * Suggest a Deputy employee for a given staff record.
 * Returns the best match plus a confidence label so callers can decide
 * whether to auto-confirm (exact) or require admin review (strong/weak).
 */
export function suggestEmployeeWithConfidence(
  staff: MatchableStaff,
  roster: DeputyEmployee[],
): SuggestionResult {
  // 1) Email exact match → exact
  if (staff.email) {
    const lower = staff.email.toLowerCase().trim();
    const byEmail = roster.find((d) => d.email && d.email.toLowerCase().trim() === lower);
    if (byEmail) return { employee: byEmail, confidence: "exact" };
  }

  const sNorm = normalizeName(staff.name);
  const sTokens = tokens(staff.name);
  if (sTokens.length === 0) return { employee: null, confidence: "none" };

  // 2) Exact normalized string match → exact
  const exact = roster.find((d) => normalizeName(d.display_name) === sNorm);
  if (exact) return { employee: exact, confidence: "exact" };

  // 3) Canonical token-set equality → strong (handles "Last, First", nicknames)
  const sSet = new Set(sTokens);
  const tokenEq = roster.find((d) => {
    const dt = new Set(tokens(d.display_name));
    if (dt.size !== sSet.size) return false;
    for (const t of sSet) if (!dt.has(t)) return false;
    return true;
  });
  if (tokenEq) return { employee: tokenEq, confidence: "strong" };

  // 4) First + last token both present → strong
  const sFirst = sTokens[0];
  const sLast = sTokens[sTokens.length - 1];
  const firstLast = roster.find((d) => {
    const dt = new Set(tokens(d.display_name));
    return dt.has(sFirst) && dt.has(sLast);
  });
  if (firstLast) return { employee: firstLast, confidence: "strong" };

  // 5) Weighted Jaccard fallback → weak
  let best: { d: DeputyEmployee; score: number } | null = null;
  for (const d of roster) {
    const dTokens = tokens(d.display_name);
    if (dTokens.length === 0) continue;
    const dSet = new Set(dTokens);
    let inter = 0;
    for (const t of sSet) if (dSet.has(t)) inter++;
    const union = new Set([...sSet, ...dSet]).size;
    let score = union ? inter / union : 0;
    if (dSet.has(sLast)) score += 0.15;
    if (!best || score > best.score) best = { d, score };
  }
  if (best && best.score >= 0.5) return { employee: best.d, confidence: "weak" };
  return { employee: null, confidence: "none" };
}

/** Backward-compatible helper that just returns the employee. */
export function suggestEmployee(
  staff: MatchableStaff,
  roster: DeputyEmployee[],
): DeputyEmployee | null {
  return suggestEmployeeWithConfidence(staff, roster).employee;
}
