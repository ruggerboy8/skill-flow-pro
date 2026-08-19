import { describe, it, expect } from 'vitest';
import { getQuarterWindow } from './evaluations';

// getQuarterWindow computes, for a given instant and timezone, which
// calendar quarter we are heading into or just finished, and whether we're
// inside the "review window" (last 2 weeks of a quarter or first 2 weeks of
// the next one) when quarterly evaluations should be prompted.

describe('getQuarterWindow', () => {
  it('mid-quarter (Feb 15) is not in the review window and targets Q1', () => {
    const result = getQuarterWindow(new Date(Date.UTC(2026, 1, 15, 12)), 'UTC');
    expect(result.targetQuarter).toBe('Q1');
    expect(result.targetYear).toBe(2026);
    expect(result.isInWindow).toBe(false);
  });

  it('day 14 of a quarter start month is inside the first-two-weeks window', () => {
    const result = getQuarterWindow(new Date(Date.UTC(2026, 3, 14, 12)), 'UTC');
    expect(result.targetQuarter).toBe('Q2');
    expect(result.isInWindow).toBe(true);
  });

  it('day 15 of a quarter start month is just outside the first-two-weeks window', () => {
    const result = getQuarterWindow(new Date(Date.UTC(2026, 3, 15, 12)), 'UTC');
    expect(result.targetQuarter).toBe('Q2');
    expect(result.isInWindow).toBe(false);
  });

  it('day 15 of a quarter end month is inside the last-two-weeks window', () => {
    const result = getQuarterWindow(new Date(Date.UTC(2026, 2, 15, 12)), 'UTC');
    expect(result.targetQuarter).toBe('Q1');
    expect(result.isInWindow).toBe(true);
  });

  it('day 14 of a quarter end month is just outside the last-two-weeks window', () => {
    const result = getQuarterWindow(new Date(Date.UTC(2026, 2, 14, 12)), 'UTC');
    expect(result.targetQuarter).toBe('Q1');
    expect(result.isInWindow).toBe(false);
  });

  it('reads the date in the given timezone, not the machine timezone', () => {
    // 2026-04-01 00:30 UTC is still 2026-03-31 in US/Pacific (UTC-7 in April).
    const utcMoment = new Date(Date.UTC(2026, 3, 1, 0, 30));
    const utcResult = getQuarterWindow(utcMoment, 'UTC');
    const pacificResult = getQuarterWindow(utcMoment, 'America/Los_Angeles');

    expect(utcResult.targetQuarter).toBe('Q2'); // April 1 in UTC
    expect(pacificResult.targetQuarter).toBe('Q1'); // still March 31 in Pacific
  });
});
