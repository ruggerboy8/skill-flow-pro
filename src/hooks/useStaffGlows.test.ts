import { describe, it, expect } from 'vitest';
import { resolveGiverFirstName } from './useStaffGlows';

describe('resolveGiverFirstName', () => {
  it('returns the first name from a full name snapshot', () => {
    expect(resolveGiverFirstName('Ariyana Torres')).toBe('Ariyana');
  });

  it('returns the whole value when there is no space', () => {
    expect(resolveGiverFirstName('Ariyana')).toBe('Ariyana');
  });

  it('returns null for a null snapshot (pre-MOB-4 glow, no name recorded)', () => {
    expect(resolveGiverFirstName(null)).toBeNull();
  });

  it('returns null for an empty or whitespace-only snapshot', () => {
    expect(resolveGiverFirstName('')).toBeNull();
    expect(resolveGiverFirstName('   ')).toBeNull();
  });

  it('trims leading whitespace before splitting', () => {
    expect(resolveGiverFirstName('  Ariyana Torres')).toBe('Ariyana');
  });
});
