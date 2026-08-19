/**
 * BUG-1: notes written in the classic EvaluationHub form (one combined
 * observer_note) must surface in the capture flow as Glow/Grow. These tests
 * cover the pure detection and the conversion routine with injected
 * dependencies, so no network or Supabase is involved.
 */
import { describe, it, expect, vi } from "vitest";

import {
  legacyNoteOf,
  findLegacyNoteItems,
  convertLegacyNotes,
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
    const save = vi.fn(async (_evalId: string, _competencyId: number, _patch: Record<string, unknown>) => {});
    const d = data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, legacyNote: "one", name: "Rapport", proMoves: ["Smile"] }),
        comp({ competencyId: 11, glow: "already" }),
        comp({ competencyId: 12, legacyNote: "two" }),
      ] },
    ]);
    const res = await convertLegacyNotes(d, { separate, save, concurrency: 2 });
    expect(res.failed).toEqual([]);
    expect(res.converted.map((c) => c.competencyId).sort()).toEqual([10, 12]);
    expect(separate).toHaveBeenCalledTimes(2);
    expect(separate).toHaveBeenCalledWith(expect.objectContaining({
      text: "one",
      competency: expect.objectContaining({ name: "Rapport", proMoves: ["Smile"] }),
    }));
    expect(save).toHaveBeenCalledTimes(2);
    const patch = save.mock.calls.find((c) => c[1] === 10)![2];
    expect(patch).toEqual({ observer_glow: "G:one", observer_grow: "R:one" });
    expect(patch).not.toHaveProperty("observer_note");
  });

  it("reports a failure (and does not save) when the split throws or returns nothing", async () => {
    const separate = vi.fn(async ({ text }: { text: string }) => {
      if (text === "boom") throw new Error("edge function down");
      if (text === "empty") return { glow: null, grow: "  " };
      return { glow: "ok", grow: null };
    });
    const save = vi.fn(async () => {});
    const d = data([
      { domainId: 3, domainName: "Cultural", summary: null, competencies: [
        comp({ competencyId: 30, legacyNote: "boom" }),
        comp({ competencyId: 31, legacyNote: "empty" }),
        comp({ competencyId: 32, legacyNote: "fine" }),
      ] },
    ]);
    const res = await convertLegacyNotes(d, { separate, save, concurrency: 1 });
    expect(res.converted.map((c) => c.competencyId)).toEqual([32]);
    expect(res.failed.map((f) => [f.competencyId, f.legacyNote])).toEqual([[30, "boom"], [31, "empty"]]);
    expect(res.failed[0].error).toMatch(/edge function down/);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("normalizes empty-string glow/grow from the splitter to null before saving", async () => {
    const separate = vi.fn(async () => ({ glow: "Kept calm with a nervous patient.", grow: "" }));
    const save = vi.fn(async (_evalId: string, _competencyId: number, _patch: Record<string, unknown>) => {});
    const res = await convertLegacyNotes(data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [comp({ competencyId: 5, legacyNote: "n" })] },
    ]), { separate, save });
    expect(res.failed).toEqual([]);
    expect(save.mock.calls[0][2]).toEqual({ observer_glow: "Kept calm with a nervous patient.", observer_grow: null });
    expect(res.converted[0]).toMatchObject({ glow: "Kept calm with a nervous patient.", grow: null });
  });

  it("does nothing when there are no legacy notes", async () => {
    const separate = vi.fn();
    const save = vi.fn();
    const res = await convertLegacyNotes(data([
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [comp({ competencyId: 1, glow: "g" })] },
    ]), { separate, save });
    expect(res).toEqual({ converted: [], failed: [] });
    expect(separate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
