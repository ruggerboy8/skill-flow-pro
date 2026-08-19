/**
 * BUG-1: notes written in the classic EvaluationHub form (one combined
 * observer_note) must surface in the capture flow as Glow/Grow. These tests
 * cover the pure detection and the conversion routine with injected
 * dependencies, so no network or Supabase is involved.
 */
import { describe, it, expect, vi } from "vitest";
import { queueTable, getTableCalls } from "@/test/supabaseMock";

import {
  legacyNoteOf,
  findLegacyNoteItems,
  convertLegacyNotes,
  saveLegacySplit,
  type CaptureCompetency,
  type CaptureData,
} from "@/lib/evalCaptureData";

function comp(over: Partial<CaptureCompetency> & { competencyId: number }): CaptureCompetency {
  return {
    name: `Competency ${over.competencyId}`,
    tagline: null,
    description: null,
    proMoves: [],
    observerScore: null,
    observerIsNA: false,
    glow: null,
    grow: null,
    legacyNote: null,
    ...over,
  };
}

function data(domains: CaptureData["domains"]): Pick<CaptureData, "evalId" | "domains"> {
  return { evalId: "eval-1", domains };
}

describe("legacyNoteOf", () => {
  it("returns the trimmed note when glow and grow are both empty", () => {
    expect(legacyNoteOf({ observer_note: "  Great with kids.  " })).toBe("Great with kids.");
  });
  it("returns null when the note is empty or whitespace", () => {
    expect(legacyNoteOf({ observer_note: null })).toBeNull();
    expect(legacyNoteOf({ observer_note: "   " })).toBeNull();
    expect(legacyNoteOf({})).toBeNull();
  });
  it("returns null once glow or grow exists, so conversion is idempotent", () => {
    expect(legacyNoteOf({ observer_note: "x", observer_glow: "nice" })).toBeNull();
    expect(legacyNoteOf({ observer_note: "x", observer_grow: "work on" })).toBeNull();
    expect(legacyNoteOf({ observer_note: "x", observer_glow: "   ", observer_grow: "  " })).toBe("x");
  });
});

describe("findLegacyNoteItems", () => {
  it("lists only competencies that carry a legacy note, with their domain", () => {
    const d = data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, legacyNote: "old note" }),
        comp({ competencyId: 11, glow: "g" }),
      ] },
      { domainId: 2, domainName: "Clerical", summary: null, competencies: [
        comp({ competencyId: 20, legacyNote: "another" }),
      ] },
    ]);
    const found = findLegacyNoteItems(d);
    expect(found.map((f) => [f.domainId, f.competency.competencyId])).toEqual([[1, 10], [2, 20]]);
  });
});

describe("convertLegacyNotes", () => {
  it("splits each legacy note, saves glow/grow only, and leaves observer_note alone", async () => {
    const separate = vi.fn(async ({ text }: { text: string }) => ({ glow: `G:${text}`, grow: `R:${text}` }));
    const saveSplit = vi.fn(async (..._args: unknown[]) => "saved" as const);
    const d = data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, legacyNote: "one", name: "Rapport", proMoves: ["Smile"] }),
        comp({ competencyId: 11, glow: "already" }),
        comp({ competencyId: 12, legacyNote: "two" }),
      ] },
    ]);
    const res = await convertLegacyNotes(d, { separate, saveSplit, concurrency: 2 });
    expect(res.failed).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(res.converted.map((c) => c.competencyId).sort()).toEqual([10, 12]);
    expect(separate).toHaveBeenCalledTimes(2);
    expect(separate).toHaveBeenCalledWith(expect.objectContaining({
      text: "one",
      competency: expect.objectContaining({ name: "Rapport", proMoves: ["Smile"] }),
    }));
    expect(saveSplit).toHaveBeenCalledTimes(2);
    // Saved with the ORIGINAL note as the freshness key, glow/grow only.
    expect(saveSplit).toHaveBeenCalledWith("eval-1", 10, "one", "G:one", "R:one");
  });

  it("reports skipped (and not converted) when the row changed before the split finished", async () => {
    const separate = vi.fn(async () => ({ glow: "g", grow: "r" }));
    const saveSplit = vi.fn(async (_e: string, competencyId: number) => (competencyId === 10 ? "skipped" as const : "saved" as const));
    const d = data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, legacyNote: "edited meanwhile" }),
        comp({ competencyId: 11, legacyNote: "fine" }),
      ] },
    ]);
    const res = await convertLegacyNotes(d, { separate, saveSplit, concurrency: 1 });
    expect(res.converted.map((c) => c.competencyId)).toEqual([11]);
    expect(res.skipped.map((s) => s.competencyId)).toEqual([10]);
    expect(res.failed).toEqual([]);
  });

  it("reports a failure (and does not save) when the split throws or returns nothing", async () => {
    const separate = vi.fn(async ({ text }: { text: string }) => {
      if (text === "boom") throw new Error("edge function down");
      if (text === "empty") return { glow: null, grow: "  " };
      return { glow: "ok", grow: null };
    });
    const saveSplit = vi.fn(async () => "saved" as const);
    const d = data([
      { domainId: 3, domainName: "Cultural", summary: null, competencies: [
        comp({ competencyId: 30, legacyNote: "boom" }),
        comp({ competencyId: 31, legacyNote: "empty" }),
        comp({ competencyId: 32, legacyNote: "fine" }),
      ] },
    ]);
    const res = await convertLegacyNotes(d, { separate, saveSplit, concurrency: 1 });
    expect(res.converted.map((c) => c.competencyId)).toEqual([32]);
    expect(res.failed.map((f) => [f.competencyId, f.legacyNote])).toEqual([[30, "boom"], [31, "empty"]]);
    expect(res.failed[0].error).toMatch(/edge function down/);
    expect(saveSplit).toHaveBeenCalledTimes(1);
  });

  it("normalizes empty-string glow/grow from the splitter to null before saving", async () => {
    const separate = vi.fn(async () => ({ glow: "Kept calm with a nervous patient.", grow: "" }));
    const saveSplit = vi.fn(async (..._args: unknown[]) => "saved" as const);
    const res = await convertLegacyNotes(data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [comp({ competencyId: 5, legacyNote: "n" })] },
    ]), { separate, saveSplit });
    expect(res.failed).toEqual([]);
    expect(saveSplit).toHaveBeenCalledWith("eval-1", 5, "n", "Kept calm with a nervous patient.", null);
    expect(res.converted[0]).toMatchObject({ glow: "Kept calm with a nervous patient.", grow: null });
  });

  it("still processes every item when concurrency is not a usable number (QA finding)", async () => {
    const separate = vi.fn(async () => ({ glow: "g", grow: "r" }));
    const saveSplit = vi.fn(async () => "saved" as const);
    const d = data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, legacyNote: "one" }),
        comp({ competencyId: 11, legacyNote: "two" }),
      ] },
    ]);
    for (const bad of [Number("abc"), 0, -3, Infinity]) {
      separate.mockClear();
      const res = await convertLegacyNotes(d, { separate, saveSplit, concurrency: bad });
      expect(separate).toHaveBeenCalledTimes(2);
      expect(res.converted.length + res.failed.length).toBe(2);
    }
  });

  it("does nothing when there are no legacy notes", async () => {
    const separate = vi.fn();
    const saveSplit = vi.fn();
    const res = await convertLegacyNotes(data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [comp({ competencyId: 1, glow: "g" })] },
    ]), { separate, saveSplit });
    expect(res).toEqual({ converted: [], failed: [], skipped: [] });
    expect(separate).not.toHaveBeenCalled();
    expect(saveSplit).not.toHaveBeenCalled();
  });
});

describe("saveLegacySplit (conditional write)", () => {
  const draftEval = { data: { status: "draft" }, error: null };
  const legacyRow = { data: { observer_note: "old note", observer_glow: null, observer_grow: null }, error: null };

  it("writes glow/grow keyed on the original note when the row is untouched and the eval is a draft", async () => {
    queueTable("evaluations", draftEval);
    queueTable("evaluation_items", legacyRow);
    queueTable("evaluation_items", { data: [{ competency_id: 7 }], error: null });
    const out = await saveLegacySplit("eval-1", 7, "old note", "G", "R");
    expect(out).toBe("saved");
    const update = getTableCalls("evaluation_items").find((c) => c.method === "update")!;
    expect(update.payload).toEqual({ observer_glow: "G", observer_grow: "R" });
    expect(update.filters).toContainEqual({ op: "eq", args: ["observer_note", "old note"] });
    expect(update.filters).toContainEqual({ op: "eq", args: ["evaluation_id", "eval-1"] });
    expect(update.filters).toContainEqual({ op: "eq", args: ["competency_id", 7] });
  });

  it("skips without writing when the eval is no longer a draft", async () => {
    queueTable("evaluations", { data: { status: "submitted" }, error: null });
    const out = await saveLegacySplit("eval-1", 7, "old note", "G", "R");
    expect(out).toBe("skipped");
    expect(getTableCalls("evaluation_items")).toEqual([]);
  });

  it("skips without writing when the note was edited or already split meanwhile", async () => {
    queueTable("evaluations", draftEval);
    queueTable("evaluation_items", { data: { observer_note: "edited in classic editor", observer_glow: null, observer_grow: null }, error: null });
    expect(await saveLegacySplit("eval-1", 7, "old note", "G", "R")).toBe("skipped");
    expect(getTableCalls("evaluation_items").filter((c) => c.method === "update")).toEqual([]);

    queueTable("evaluations", draftEval);
    queueTable("evaluation_items", { data: { observer_note: "old note", observer_glow: "already", observer_grow: null }, error: null });
    expect(await saveLegacySplit("eval-1", 7, "old note", "G", "R")).toBe("skipped");
  });

  it("skips when the conditional update matches zero rows (note changed between read and write)", async () => {
    queueTable("evaluations", draftEval);
    queueTable("evaluation_items", legacyRow);
    queueTable("evaluation_items", { data: [], error: null });
    expect(await saveLegacySplit("eval-1", 7, "old note", "G", "R")).toBe("skipped");
  });
});
