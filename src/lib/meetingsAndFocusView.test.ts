import { describe, it, expect } from 'vitest';
import {
  buildPipelineChips, deriveWeekGlyphStates, shouldHideEmptyBadge, isBuilderDirty,
} from './meetingsAndFocusView';
import type { HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';
import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';

function week(overrides: Partial<HydratedFocusWeek> = {}): HydratedFocusWeek {
  return {
    id: 'w1', organization_id: 'org1', created_by: 'staff1',
    week_start_date: '2026-08-10', framing: null, status: 'published',
    published_at: '2026-08-10T12:00:00Z', created_at: '2026-08-10T12:00:00Z', updated_at: '2026-08-10T12:00:00Z',
    items: [{ id: 'i1', display_order: 1, text: 'Focus on X', source_issue_id: null, outcome: 'pending' }],
    ...overrides,
  };
}

function meeting(overrides: Partial<LeadMeetingRow> = {}): LeadMeetingRow {
  return {
    id: 'm1', organization_id: 'org1', created_by: 'staff1',
    meeting_date: '2026-08-11', week_start_date: '2026-08-10',
    raw_transcript: null, internal_summary: null,
    created_at: '2026-08-11T12:00:00Z', updated_at: '2026-08-11T12:00:00Z',
    ...overrides,
  };
}

function blast(overrides: Partial<LeadWeekBlastRow> = {}): LeadWeekBlastRow {
  return {
    id: 'b1', organization_id: 'org1', created_by: 'staff1',
    week_start_date: '2026-08-10', body: 'Hello doctors', status: 'draft',
    sent_at: null, sent_by: null, recipient_count: null, failed_count: null,
    location_id: null,
    created_at: '2026-08-10T12:00:00Z', updated_at: '2026-08-10T12:00:00Z',
    ...overrides,
  };
}

describe('buildPipelineChips', () => {
  it('builds one chip per step, carrying its state through unchanged', () => {
    const chips = buildPipelineChips('completed', 'not_started', 'draftable');
    expect(chips).toEqual([
      { key: 'focus', label: 'Focus', status: 'completed' },
      { key: 'meeting', label: 'Meeting', status: 'not_started' },
      { key: 'blast', label: 'Blast', status: 'not_started', badgeLabel: undefined },
    ]);
  });

  it('softens the blast chip label when the week has nothing to draft from', () => {
    const chips = buildPipelineChips('not_started', 'not_started', 'none');
    const blastChip = chips.find((c) => c.key === 'blast');
    expect(blastChip?.status).toBe('locked');
    expect(blastChip?.badgeLabel).toBe('Waiting');
  });

  it('reflects a sent blast as completed with no label override', () => {
    const chips = buildPipelineChips('completed', 'completed', 'sent');
    const blastChip = chips.find((c) => c.key === 'blast');
    expect(blastChip?.status).toBe('completed');
    expect(blastChip?.badgeLabel).toBeUndefined();
  });
});

describe('deriveWeekGlyphStates', () => {
  it('reads every slot as empty for a week with nothing recorded', () => {
    expect(deriveWeekGlyphStates(null, [], null)).toEqual({
      focus: 'not_started', meeting: 'not_started', blast: 'none',
    });
  });

  it('reads a published focus, a logged meeting, and a sent blast as complete', () => {
    const w = week();
    const m = [meeting()];
    const b = blast({ status: 'sent' });
    expect(deriveWeekGlyphStates(w, m, b)).toEqual({
      focus: 'completed', meeting: 'completed', blast: 'sent',
    });
  });

  it('treats a draft-status week (unpublished) as not started', () => {
    const w = week({ status: 'draft' });
    expect(deriveWeekGlyphStates(w, [], null).focus).toBe('not_started');
  });

  it('reads a meeting-only week as draftable for the blast, with no focus or existing blast row', () => {
    const m = [meeting()];
    expect(deriveWeekGlyphStates(undefined, m, null)).toEqual({
      focus: 'not_started', meeting: 'completed', blast: 'draftable',
    });
  });
});

describe('shouldHideEmptyBadge', () => {
  it('hides the badge for an empty past week', () => {
    expect(shouldHideEmptyBadge('past', true)).toBe(true);
  });

  it('keeps the badge for a past week that has content', () => {
    expect(shouldHideEmptyBadge('past', false)).toBe(false);
  });

  it('keeps the badge for an empty current week', () => {
    expect(shouldHideEmptyBadge('current', true)).toBe(false);
  });

  it('keeps the badge for an empty future week', () => {
    expect(shouldHideEmptyBadge('future', true)).toBe(false);
  });
});

describe('isBuilderDirty', () => {
  const snapshot = { items: [{ text: 'Item one', sourceId: null }], framing: 'Some framing' };

  it('is not dirty when current fields exactly match the snapshot', () => {
    expect(isBuilderDirty({ items: [{ text: 'Item one', sourceId: null }], framing: 'Some framing', ownDraft: '' }, snapshot)).toBe(false);
  });

  it('is dirty when there is unsaved text in the "write your own" input', () => {
    expect(isBuilderDirty({ items: snapshot.items, framing: snapshot.framing, ownDraft: 'half-typed idea' }, snapshot)).toBe(true);
  });

  it('ignores whitespace-only text in the "write your own" input', () => {
    expect(isBuilderDirty({ items: snapshot.items, framing: snapshot.framing, ownDraft: '   ' }, snapshot)).toBe(false);
  });

  it('is dirty when the framing note changed', () => {
    expect(isBuilderDirty({ items: snapshot.items, framing: 'Different framing', ownDraft: '' }, snapshot)).toBe(true);
  });

  it('is dirty when an item was added', () => {
    const items = [...snapshot.items, { text: 'Item two', sourceId: null }];
    expect(isBuilderDirty({ items, framing: snapshot.framing, ownDraft: '' }, snapshot)).toBe(true);
  });

  it('is dirty when an item was removed', () => {
    expect(isBuilderDirty({ items: [], framing: snapshot.framing, ownDraft: '' }, snapshot)).toBe(true);
  });

  it('is dirty when an item\'s text changed', () => {
    const items = [{ text: 'Edited item one', sourceId: null }];
    expect(isBuilderDirty({ items, framing: snapshot.framing, ownDraft: '' }, snapshot)).toBe(true);
  });

  it('is not dirty for a brand-new empty builder with an empty snapshot', () => {
    const emptySnapshot = { items: [], framing: '' };
    expect(isBuilderDirty({ items: [], framing: '', ownDraft: '' }, emptySnapshot)).toBe(false);
  });
});
