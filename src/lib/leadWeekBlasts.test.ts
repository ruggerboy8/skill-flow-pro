import { describe, it, expect } from 'vitest';
import {
  canDraftBlast, deriveBlastSlotState, blastSlotBadgeStatus, blastBadgeLabel,
  buildSendConfirmBody, shouldConfirmRegenerate, canConfirmSend, formatSentSummary,
} from './leadWeekBlasts';
import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';

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

describe('canDraftBlast', () => {
  it('is false when there is neither a published focus nor any meeting', () => {
    expect(canDraftBlast(false, 0)).toBe(false);
  });

  it('is true when there is a published focus, even with no meeting', () => {
    expect(canDraftBlast(true, 0)).toBe(true);
  });

  it('is true when there is at least one meeting, even with no published focus', () => {
    expect(canDraftBlast(false, 1)).toBe(true);
  });

  it('is true when both a published focus and meetings exist', () => {
    expect(canDraftBlast(true, 2)).toBe(true);
  });
});

describe('deriveBlastSlotState', () => {
  it('is none for an empty week with no blast row', () => {
    expect(deriveBlastSlotState(false, 0, null)).toBe('none');
  });

  it('is draftable when the week has a published focus and no blast row yet', () => {
    expect(deriveBlastSlotState(true, 0, null)).toBe('draftable');
  });

  it('is draftable when the week has a logged meeting and no blast row yet', () => {
    expect(deriveBlastSlotState(false, 1, null)).toBe('draftable');
  });

  it('is draft when a draft blast row exists', () => {
    expect(deriveBlastSlotState(true, 0, blast({ status: 'draft' }))).toBe('draft');
  });

  it('is sent once the blast row is sent, regardless of the week contents', () => {
    expect(deriveBlastSlotState(true, 1, blast({ status: 'sent' }))).toBe('sent');
  });

  it('is sent even if the underlying focus/meetings would otherwise read as empty', () => {
    expect(deriveBlastSlotState(false, 0, blast({ status: 'sent' }))).toBe('sent');
  });
});

describe('blastSlotBadgeStatus', () => {
  it('maps none to locked', () => {
    expect(blastSlotBadgeStatus('none')).toBe('locked');
  });

  it('maps draftable to not_started', () => {
    expect(blastSlotBadgeStatus('draftable')).toBe('not_started');
  });

  it('maps draft to draft', () => {
    expect(blastSlotBadgeStatus('draft')).toBe('draft');
  });

  it('maps sent to completed', () => {
    expect(blastSlotBadgeStatus('sent')).toBe('completed');
  });
});

describe('blastBadgeLabel', () => {
  it('softens the none state to "Waiting"', () => {
    expect(blastBadgeLabel('none')).toBe('Waiting');
  });

  it('has no override for draftable, draft, or sent', () => {
    expect(blastBadgeLabel('draftable')).toBeUndefined();
    expect(blastBadgeLabel('draft')).toBeUndefined();
    expect(blastBadgeLabel('sent')).toBeUndefined();
  });
});

describe('buildSendConfirmBody', () => {
  it('pluralizes doctors for counts other than one', () => {
    expect(buildSendConfirmBody(4)).toBe(
      'This emails 4 doctors across the organization. It cannot be sent twice.',
    );
  });

  it('uses the singular for exactly one doctor', () => {
    expect(buildSendConfirmBody(1)).toBe(
      'This emails 1 doctor across the organization. It cannot be sent twice.',
    );
  });

  it('handles zero as plural', () => {
    expect(buildSendConfirmBody(0)).toBe(
      'This emails 0 doctors across the organization. It cannot be sent twice.',
    );
  });
});

describe('shouldConfirmRegenerate', () => {
  it('does not require a confirm when the body is unchanged from what was generated', () => {
    expect(shouldConfirmRegenerate('Hello doctors', 'Hello doctors')).toBe(false);
  });

  it('does not require a confirm when only surrounding whitespace differs', () => {
    expect(shouldConfirmRegenerate('  Hello doctors  ', 'Hello doctors')).toBe(false);
  });

  it('requires a confirm once the body has been hand-edited', () => {
    expect(shouldConfirmRegenerate('Hello doctors, changed my mind', 'Hello doctors')).toBe(true);
  });
});

describe('canConfirmSend', () => {
  it('is false when there are no eligible doctors', () => {
    expect(canConfirmSend(0)).toBe(false);
  });

  it('is true once there is at least one eligible doctor', () => {
    expect(canConfirmSend(1)).toBe(true);
    expect(canConfirmSend(12)).toBe(true);
  });
});

describe('formatSentSummary', () => {
  it('reports a clean count when nothing failed', () => {
    expect(formatSentSummary(6, 0)).toBe('6 doctors');
  });

  it('uses the singular for exactly one successful send with no failures', () => {
    expect(formatSentSummary(1, 0)).toBe('1 doctor');
  });

  it('surfaces the shortfall when some sends failed, instead of hiding it', () => {
    expect(formatSentSummary(4, 2)).toBe('4 of 6 doctors');
  });

  it('still pluralizes the total correctly when the total is exactly one', () => {
    expect(formatSentSummary(0, 1)).toBe('0 of 1 doctor');
  });

  it('never reads negative even if the inputs are malformed', () => {
    expect(formatSentSummary(-1, -1)).toBe('0 doctors');
  });
});
