/**
 * Data layer for the rebuilt per-domain evaluation capture flow.
 *
 * Reuses the existing getEvaluation loader (so the eval + items come from the
 * same place the classic EvaluationHub uses) and layers on the Pro Moves per
 * competency plus the per-(role, domain) framing summary. All writes are to the
 * existing evaluation_items row, including the additive observer_glow /
 * observer_grow columns. Nothing here touches the classic flow.
 */
import { supabase } from "@/integrations/supabase/client";
import { getEvaluation, ensureEvaluationItems } from "@/lib/evaluations";
import { getDomainSummary } from "@/lib/evalCaptureFraming";

export interface CaptureCompetency {
  competencyId: number;
  name: string;
  tagline?: string | null;
  description?: string | null;
  proMoves: string[];
  observerScore: number | null;
  observerIsNA: boolean;
  glow: string | null;
  grow: string | null;
}

export interface CaptureDomain {
  domainId: number;
  domainName: string;
  summary: string | null;
  competencies: CaptureCompetency[];
}

export interface CaptureData {
  evalId: string;
  staffId: string;
  roleId: number;
  staffStatus: string;
  domains: CaptureDomain[];
}

const DOMAIN_ORDER = [1, 2, 3, 4]; // Clinical, Clerical, Cultural, Case Acceptance

export async function loadCaptureData(evalId: string): Promise<CaptureData | null> {
  // Self-heal before loading: guarantee the per-competency rows exist so a
  // "hollow" eval (zero items) opens as a scorable page instead of a blank one.
  await ensureEvaluationItems(evalId);

  const evaluation = await getEvaluation(evalId);
  if (!evaluation) return null;

  const items = evaluation.items || [];
  const competencyIds = items.map((i) => i.competency_id);

  // Fetch Pro Moves for these competencies (the readable prompting resource).
  const proMovesByCompetency = new Map<number, string[]>();
  if (competencyIds.length > 0) {
    const { data: proMoves } = await supabase
      .from("pro_moves")
      .select("competency_id, action_statement")
      .in("competency_id", competencyIds);
    for (const pm of proMoves || []) {
      if (pm.competency_id == null) continue;
      const list = proMovesByCompetency.get(pm.competency_id) || [];
      if (pm.action_statement) list.push(pm.action_statement);
      proMovesByCompetency.set(pm.competency_id, list);
    }
  }

  const roleId = (evaluation as { role_id: number }).role_id;

  // Group items by domain.
  const byDomain = new Map<number, CaptureDomain>();
  for (const item of items) {
    const domainId = (item as { domain_id: number | null }).domain_id ?? 0;
    const domainName = (item as { domain_name?: string | null }).domain_name || "Other";
    if (!byDomain.has(domainId)) {
      byDomain.set(domainId, {
        domainId,
        domainName,
        summary: getDomainSummary(roleId, domainId),
        competencies: [],
      });
    }
    byDomain.get(domainId)!.competencies.push({
      competencyId: item.competency_id,
      name: item.competency_name_snapshot || `Competency ${item.competency_id}`,
      tagline: (item as { tagline?: string | null }).tagline ?? null,
      description: (item as { competency_description?: string | null }).competency_description ?? null,
      proMoves: proMovesByCompetency.get(item.competency_id) || [],
      observerScore: item.observer_score ?? null,
      observerIsNA: Boolean((item as { observer_is_na?: boolean }).observer_is_na),
      glow: (item as { observer_glow?: string | null }).observer_glow ?? null,
      grow: (item as { observer_grow?: string | null }).observer_grow ?? null,
    });
  }

  const domains = Array.from(byDomain.values()).sort(
    (a, b) => DOMAIN_ORDER.indexOf(a.domainId) - DOMAIN_ORDER.indexOf(b.domainId),
  );

  return {
    evalId,
    staffId: (evaluation as { staff_id: string }).staff_id,
    roleId,
    staffStatus: (evaluation as { status: string }).status,
    domains,
  };
}

export interface CaptureItemPatch {
  observer_score?: number | null;
  observer_is_na?: boolean;
  observer_glow?: string | null;
  observer_grow?: string | null;
  // Kept in sync with glow/grow for backward compatibility: the classic
  // EvaluationHub and the insights pipeline still read observer_note.
  observer_note?: string | null;
}

/** Compose the legacy combined observer_note from Glow/Grow so classic readers stay populated. */
export function buildObserverNote(glow: string | null, grow: string | null): string | null {
  const parts = [glow?.trim(), grow?.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Patch a single evaluation_items row (score, N/A, glow, grow).
 *
 * A plain update (not an upsert): the row already carries NOT NULL columns like
 * competency_name_snapshot, so an upsert's insert arm would fail the not-null
 * check before ON CONFLICT could turn it into an update. An update only touches
 * the columns in `patch`, so it is safe.
 *
 * The historical silent-data-loss bug was an update that hit ZERO rows (the eval
 * had no items) and returned no error. We defend against that directly: verify a
 * row was actually updated, and if not, seed the missing rows and retry once, so
 * a save can never no-op into a hollow eval.
 */
export async function saveCaptureItem(
  evalId: string,
  competencyId: number,
  patch: CaptureItemPatch,
): Promise<void> {
  const update = () =>
    supabase
      .from("evaluation_items")
      // Cast: observer_glow/observer_grow are newly added and not yet in generated types.
      .update(patch as never)
      .eq("evaluation_id", evalId)
      .eq("competency_id", competencyId)
      .select("competency_id");

  const { data, error } = await update();
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return;

  // No row was updated: the item rows are missing. Seed them, then retry once.
  await ensureEvaluationItems(evalId);
  const retry = await update();
  if (retry.error) throw new Error(retry.error.message);
  if (!retry.data || retry.data.length === 0) {
    throw new Error("Could not save this score: the evaluation item could not be found.");
  }
}

export interface SlottedItem {
  competency_id: number;
  glow: string | null;
  grow: string | null;
  confidence?: "high" | "low";
}

/** Split one competency's free-form feedback into a Glow and a Grow. */
export async function separateFeedback(params: {
  competency: { name: string; description?: string | null; proMoves: string[] };
  text: string;
  existingGlow?: string | null;
  existingGrow?: string | null;
  /** Openings already used on other competencies, so the model varies phrasing. */
  avoid?: string[];
}): Promise<{ glow: string | null; grow: string | null }> {
  const { data, error } = await supabase.functions.invoke("separate-feedback", { body: params });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { glow: data?.glow ?? null, grow: data?.grow ?? null };
}

/** Call the slot-domain-feedback edge function for one domain. */
export async function slotDomainFeedback(params: {
  domain: string;
  competencies: { id: number; name: string; description?: string | null; proMoves: string[] }[];
  glowText: string;
  growText: string;
}): Promise<SlottedItem[]> {
  const { data, error } = await supabase.functions.invoke("slot-domain-feedback", {
    body: params,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.items || []) as SlottedItem[];
}
