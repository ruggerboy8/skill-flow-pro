/**
 * MOB-4: a glow is expected per scored competency, not required. These tests
 * cover the pure "which competencies lack a glow" computation that backs the
 * Review & submit dialog's soft nudge, so it is unit-testable without
 * mounting EvaluationCapture or touching the network.
 */
import { describe, it, expect } from "vitest";
import { missingGlowItems, type CaptureCompetency, type CaptureData } from "@/lib/evalCaptureData";

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

describe("missingGlowItems", () => {
  it("flags a scored competency with no glow", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: 3, glow: null }),
      ] },
    ];
    expect(missingGlowItems(domains).map((c) => c.competencyId)).toEqual([10]);
  });

  it("does not flag a scored competency that already has a glow", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: 4, glow: "Great chairside manner." }),
      ] },
    ];
    expect(missingGlowItems(domains)).toEqual([]);
  });

  it("treats a whitespace-only glow the same as no glow", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: 4, glow: "   " }),
      ] },
    ];
    expect(missingGlowItems(domains).map((c) => c.competencyId)).toEqual([10]);
  });

  it("does not flag an unscored competency (nothing to have a glow about yet)", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: null, glow: null }),
      ] },
    ];
    expect(missingGlowItems(domains)).toEqual([]);
  });

  it("does not flag a competency marked Did not observe, even without a score", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: null, observerIsNA: true, glow: null }),
      ] },
    ];
    expect(missingGlowItems(domains)).toEqual([]);
  });

  it("collects flagged competencies across multiple domains, in domain order", () => {
    const domains: CaptureData["domains"] = [
      { domainId: 1, domainName: "Clinical", summary: null, competencies: [
        comp({ competencyId: 10, observerScore: 2, glow: null }),
        comp({ competencyId: 11, observerScore: 3, glow: "Nice work." }),
      ] },
      { domainId: 2, domainName: "Clerical", summary: null, competencies: [
        comp({ competencyId: 20, observerScore: 1, glow: null }),
      ] },
    ];
    expect(missingGlowItems(domains).map((c) => c.competencyId)).toEqual([10, 20]);
  });

  it("returns an empty array when there are no domains", () => {
    expect(missingGlowItems([])).toEqual([]);
  });
});
