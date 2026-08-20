import { describe, it, expect } from 'vitest';
import { pickEncouragementLine } from './genericEncouragement';

describe('pickEncouragementLine', () => {
  it('returns a non-empty string with no em dash (writing-style rule)', () => {
    const line = pickEncouragementLine(new Date('2026-08-20T12:00:00.000Z'));
    expect(line.length).toBeGreaterThan(0);
    expect(line).not.toMatch(/—/);
  });

  it('is stable for the same day', () => {
    const a = pickEncouragementLine(new Date('2026-08-20T01:00:00.000Z'));
    const b = pickEncouragementLine(new Date('2026-08-20T23:00:00.000Z'));
    expect(a).toBe(b);
  });

  it('rotates rather than always returning the same line (not a single static string)', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 10; d++) {
      seen.add(pickEncouragementLine(new Date(`2026-01-${String(d).padStart(2, '0')}T12:00:00.000Z`)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
