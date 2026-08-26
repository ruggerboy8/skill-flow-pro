import { describe, it, expect } from 'vitest';
import { maskDateInput, parseTypedDate, formatDateForDisplay } from './dateInputMask';

describe('maskDateInput', () => {
  it('inserts slashes as digits accumulate', () => {
    expect(maskDateInput('0')).toBe('0');
    expect(maskDateInput('08')).toBe('08');
    expect(maskDateInput('082')).toBe('08/2');
    expect(maskDateInput('0825')).toBe('08/25');
    expect(maskDateInput('08252026')).toBe('08/25/2026');
  });

  it('strips non-digit characters typed by the user', () => {
    expect(maskDateInput('08/25/2026')).toBe('08/25/2026');
    expect(maskDateInput('08-25-2026')).toBe('08/25/2026');
    expect(maskDateInput('ab08cd25ef2026')).toBe('08/25/2026');
  });

  it('ignores digits beyond the 8 needed', () => {
    expect(maskDateInput('082520269999')).toBe('08/25/2026');
  });

  it('handles an empty string', () => {
    expect(maskDateInput('')).toBe('');
  });
});

describe('parseTypedDate', () => {
  it('parses a complete valid date', () => {
    expect(parseTypedDate('08/25/2026')).toBe('2026-08-25');
  });

  it('accepts Sunday and Monday edge dates like any other calendar date', () => {
    expect(parseTypedDate('08/16/2026')).toBe('2026-08-16'); // Sunday
    expect(parseTypedDate('08/10/2026')).toBe('2026-08-10'); // Monday
  });

  it('returns null for an incomplete date', () => {
    expect(parseTypedDate('08/25')).toBeNull();
    expect(parseTypedDate('08/2/2026')).toBeNull();
    expect(parseTypedDate('')).toBeNull();
  });

  it('rejects a month out of range', () => {
    expect(parseTypedDate('13/01/2026')).toBeNull();
    expect(parseTypedDate('00/01/2026')).toBeNull();
  });

  it('rejects a day that does not exist in the given month', () => {
    expect(parseTypedDate('02/30/2026')).toBeNull(); // Feb has 28 days in 2026
    expect(parseTypedDate('04/31/2026')).toBeNull(); // April has 30 days
  });

  it('accepts Feb 29 on a leap year and rejects it otherwise', () => {
    expect(parseTypedDate('02/29/2024')).toBe('2024-02-29');
    expect(parseTypedDate('02/29/2026')).toBeNull();
  });
});

describe('formatDateForDisplay', () => {
  it('is the inverse of parseTypedDate', () => {
    expect(formatDateForDisplay('2026-08-25')).toBe('08/25/2026');
    expect(parseTypedDate(formatDateForDisplay('2026-08-25'))).toBe('2026-08-25');
  });
});
