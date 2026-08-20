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
  /**
   * A note written in the classic EvaluationHub form (one combined observer_note)
   * that has not yet been split into Glow/Grow. Null once glow or grow exists.
   */
  legacyNote: string | null;
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
  /**
   * evaluations.evaluator_id for this eval. Not used to attribute a glow's
   * source by default (the acting user is), but kept as the fallback so a
   * saved glow is never left with no source at all if the acting user's own
   * staff id is unavailable. See MOB-4.
   */
  evaluatorId: string | null;
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
      legacyNote: legacyNoteOf({
        observer_note: item.observer_note ?? null,
        observer_glow: (item as { observer_glow?: string | null }).observer_glow ?? null,
        observer_grow: (item as { observer_grow?: string | null }).observer_grow ?? null,
      }),
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
    evaluatorId: (evaluation as { evaluator_id?: string | null }).evaluator_id ?? null,
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
  // MOB-4: who gave this glow, and how loosely. Written only alongside a
  // non-empty observer_glow, and cleared (null) alongside a cleared glow, so
  // the two never drift out of sync. See supabase/migrations/20260820200000_mob4_glow_source_columns.sql.
  glow_source_staff_id?: string | null;
  glow_source_type?: string | null;
  // MOB-4 fix: denormalized giver display name, captured alongside
  // glow_source_staff_id since a plain participant's RLS can't resolve a
  // staff id to a name via a live join. See useStaffGlows.ts.
  glow_source_name?: string | null;
}

/**
 * Competencies that are scored (and not marked N/A) but have no glow yet.
 * Pure/UI-agnostic so the Review & submit dialog's soft "N competencies don't
 * have a glow yet" nudge (MOB-4) is unit-testable without mounting the page.
 * Deliberately NOT part of canSubmit — a glow is expected, not required.
 */
export function missingGlowItems(domains: Pick<CaptureData, "domains">["domains"]): CaptureCompetency[] {
  return domains.flatMap((d) =>
    d.competencies.filter((c) => c.observerScore != null && !c.observerIsNA && !c.glow?.trim()));
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
      // Cast: observer_glow/observer_grow/glow_source_* are newly added and not yet in generated types.
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

/* ------------------------------------------------------------------------- */
/* Legacy note conversion                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The classic EvaluationHub form saved one combined observer_note per
 * competency. The capture flow reads observer_glow / observer_grow. An item is
 * "legacy" when it has a note but neither glow nor grow: that note would
 * otherwise be invisible in the capture flow. Returns the trimmed note, or null.
 */
export function legacyNoteOf(item: {
  observer_note?: string | null;
  observer_glow?: string | null;
  observer_grow?: string | null;
}): string | null {
  const note = item.observer_note?.trim();
  if (!note) return null;
  if (item.observer_glow?.trim() || item.observer_grow?.trim()) return null;
  return note;
}

export interface LegacyNoteItem {
  domainId: number;
  competency: CaptureCompetency;
}

/** Every competency in the loaded eval that still carries an unsplit legacy note. */
export function findLegacyNoteItems(data: Pick<CaptureData, "domains">): LegacyNoteItem[] {
  const out: LegacyNoteItem[] = [];
  for (const d of data.domains) {
    for (const c of d.competencies) {
      if (c.legacyNote) out.push({ domainId: d.domainId, competency: c });
    }
  }
  return out;
}

export interface LegacyConversionResult {
  /** Items whose legacy note was split and saved as glow/grow. */
  converted: { domainId: number; competencyId: number; glow: string | null; grow: string | null }[];
  /** Items where the split failed; the caller should surface the legacy note for manual Polish. */
  failed: { domainId: number; competencyId: number; legacyNote: string; error: string }[];
  /**
   * Items the split finished for, but the row had moved on in the meantime
   * (note edited elsewhere, glow/grow already set, or the eval no longer a
   * draft). Nothing was written; the caller should not touch the screen for
   * these.
   */
  skipped: { domainId: number; competencyId: number; reason: string }[];
}

type SeparateFn = typeof separateFeedback;

/**
 * Persist a legacy split ONLY if the row is still exactly as it was when the
 * split started and the eval is still a draft. The split is asynchronous and
 * the page is interactive meanwhile, so the coach may have submitted, edited
 * the note in the classic editor, or converted it from another tab. A stale
 * split must never overwrite any of that.
 *
 * Returns "saved" or "skipped". The freshness check is a re-read followed by a
 * conditional update keyed on the original note text, so a note edited between
 * the read and the write still fails the update (zero rows) and is skipped.
 */
export async function saveLegacySplit(
  evalId: string,
  competencyId: number,
  originalNote: string,
  glow: string | null,
  grow: string | null,
): Promise<"saved" | "skipped"> {
  const { data: evalRow, error: evalError } = await supabase
    .from("evaluations")
    .select("status")
    .eq("id", evalId)
    .maybeSingle();
  if (evalError) throw new Error(evalError.message);
  if (!evalRow || (evalRow as { status: string }).status !== "draft") return "skipped";

  const { data: item, error: itemError } = await supabase
    .from("evaluation_items")
    .select("observer_note, observer_glow, observer_grow")
    .eq("evaluation_id", evalId)
    .eq("competency_id", competencyId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) return "skipped";
  const current = item as { observer_note: string | null; observer_glow?: string | null; observer_grow?: string | null };
  if (legacyNoteOf(current) !== originalNote.trim()) return "skipped";

  const { data: updated, error: updateError } = await supabase
    .from("evaluation_items")
    // Cast: observer_glow/observer_grow are not yet in generated types.
    .update({ observer_glow: glow, observer_grow: grow } as never)
    .eq("evaluation_id", evalId)
    .eq("competency_id", competencyId)
    .eq("observer_note", current.observer_note as string)
    .select("competency_id");
  if (updateError) throw new Error(updateError.message);
  return updated && updated.length > 0 ? "saved" : "skipped";
}

type SaveSplitFn = typeof saveLegacySplit;

/**
 * Split every legacy note in the eval into Glow/Grow and persist the result.
 * The original observer_note is left untouched, so nothing is lost if the split
 * is poor: the coach can still see and edit it, and staff-facing screens that
 * fall back to observer_note are unaffected. Items that already have glow or
 * grow are skipped, so once a split has succeeded a second open converts
 * nothing. Items whose split failed still have no glow/grow, so they are
 * retried on the next open; that is deliberate (a transient outage should not
 * strand a note), and the caller surfaces them for manual Polish meanwhile.
 *
 * Dependencies are injectable so this can be tested without the network.
 */
export async function convertLegacyNotes(
  data: Pick<CaptureData, "evalId" | "domains">,
  deps: { separate?: SeparateFn; saveSplit?: SaveSplitFn; concurrency?: number } = {},
): Promise<LegacyConversionResult> {
  const separate = deps.separate ?? separateFeedback;
  const saveSplit = deps.saveSplit ?? saveLegacySplit;
  const requested = deps.concurrency;
  const concurrency = typeof requested === "number" && Number.isFinite(requested) && requested >= 1
    ? Math.floor(requested)
    : 4;

  const items = findLegacyNoteItems(data);
  const result: LegacyConversionResult = { converted: [], failed: [], skipped: [] };
  if (items.length === 0) return result;

  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const { domainId, competency: comp } = items[cursor++];
      const legacyNote = comp.legacyNote as string;
      try {
        const split = await separate({
          competency: { name: comp.name, description: comp.description, proMoves: comp.proMoves },
          text: legacyNote,
          existingGlow: null,
          existingGrow: null,
        });
        // Normalize empties to null, matching what the capture form itself saves.
        const glow = split.glow?.trim() ? split.glow : null;
        const grow = split.grow?.trim() ? split.grow : null;
        // A split that returns nothing at all would silently hide the note
        // behind empty glow/grow. Treat it as a failure so the note stays visible.
        if (!glow && !grow) {
          throw new Error("The split returned no glow or grow.");
        }
        // observer_note is intentionally NOT rewritten here: the original
        // wording stays on the row as the source of truth for this conversion.
        const outcome = await saveSplit(data.evalId, comp.competencyId, legacyNote, glow, grow);
        if (outcome === "saved") {
          result.converted.push({ domainId, competencyId: comp.competencyId, glow, grow });
        } else {
          result.skipped.push({ domainId, competencyId: comp.competencyId, reason: "row changed before the split finished" });
        }
      } catch (e) {
        result.failed.push({
          domainId,
          competencyId: comp.competencyId,
          legacyNote,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}
