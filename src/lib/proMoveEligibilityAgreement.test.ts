import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// PML-2c: "one shared eligibility rule" (docs/audits/tenant-model-audit-2026-09-03.md
// finding D's guard recommendation, narrow version; see the ticket for the
// broader-CI-guard decision left open with John). The real guarantee is
// structural: every surface that decides "which pro moves can this org see"
// calls org_visible_pro_moves, either directly (the sequencer and the
// AI-suggest edge function, which query it themselves) or through the one
// shared fetchEligibleProMoves helper (the three planner pickers). Because
// they all resolve to the same RPC call, picker eligibility and sequencer
// eligibility cannot silently re-diverge into three separate
// implementations the way they had before this ticket. This test reads the
// source files rather than importing them, because two of the five
// (sequencer-rank, pro-move-suggest) are Deno edge functions outside the
// Vite/Vitest module graph.

const root = resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8');
}

describe('org_visible_pro_moves is the single eligibility rule (PML-2c guard)', () => {
  it('the shared eligibility helper calls org_visible_pro_moves', () => {
    expect(readSource('src/lib/proMoveEligibility.ts')).toContain("'org_visible_pro_moves'");
  });

  it.each([
    ['ProMovePickerDialog', 'src/components/planner/ProMovePickerDialog.tsx'],
    ['SmartSlotPicker', 'src/components/planner/SmartSlotPicker.tsx'],
    ['LibraryPanel', 'src/components/planner/LibraryPanel.tsx'],
  ])('%s derives its platform-move list through the shared eligibility helper', (_name, path) => {
    const source = readSource(path);
    expect(source).toContain("from '@/lib/proMoveEligibility'");
    expect(source).toContain('fetchEligibleProMoves(');
  });

  it('pro-move-suggest (AI-suggest) calls org_visible_pro_moves directly', () => {
    expect(readSource('supabase/functions/pro-move-suggest/index.ts')).toContain(
      "rpc('org_visible_pro_moves'"
    );
  });

  it('sequencer-rank calls org_visible_pro_moves directly (already true before this ticket)', () => {
    expect(readSource('supabase/functions/sequencer-rank/index.ts')).toContain(
      "rpc('org_visible_pro_moves'"
    );
  });
});
