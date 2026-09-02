import { describe, it, expect } from 'vitest';
import { initialsFor } from './AvatarMenu';

describe('initialsFor', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsFor('Ariyana Test')).toBe('AT');
  });

  it('uppercases lowercase input', () => {
    expect(initialsFor('ariyana test')).toBe('AT');
  });

  it('handles a single name with just its first letter', () => {
    expect(initialsFor('Cher')).toBe('C');
  });

  it('uses first and last of a multi-part name, skipping the middle', () => {
    expect(initialsFor('Mary Jane Watson')).toBe('MW');
  });

  it('collapses extra internal whitespace', () => {
    expect(initialsFor('  Ariyana   Test  ')).toBe('AT');
  });

  it('falls back to "?" for null, undefined, or empty/whitespace-only names', () => {
    expect(initialsFor(null)).toBe('?');
    expect(initialsFor(undefined)).toBe('?');
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
});
