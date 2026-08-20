import { describe, it, expect } from 'vitest';
import { cadenceStatus, cadenceLabel } from './evalCadence';

describe('cadenceStatus', () => {
  it('treats no record as missing', () => {
    expect(cadenceStatus(null)).toBe('missing');
  });

  it('treats >90 days as missing (overdue)', () => {
    expect(cadenceStatus(91)).toBe('missing');
    expect(cadenceStatus(200)).toBe('missing');
  });

  it('treats the 90-day boundary itself as late, not missing', () => {
    expect(cadenceStatus(90)).toBe('late');
  });

  it('treats 61-90 days as late (due soon)', () => {
    expect(cadenceStatus(61)).toBe('late');
    expect(cadenceStatus(90)).toBe('late');
  });

  it('treats the 60-day boundary itself as complete, not late', () => {
    expect(cadenceStatus(60)).toBe('complete');
  });

  it('treats <=60 days as complete (good)', () => {
    expect(cadenceStatus(0)).toBe('complete');
    expect(cadenceStatus(60)).toBe('complete');
  });
});

describe('cadenceLabel', () => {
  it('labels no record distinctly from a day count', () => {
    expect(cadenceLabel(null)).toBe('No eval on record');
  });

  it('renders a "Nd ago" label for a day count', () => {
    expect(cadenceLabel(0)).toBe('0d ago');
    expect(cadenceLabel(45)).toBe('45d ago');
  });
});
