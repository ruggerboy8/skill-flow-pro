import { describe, it, expect } from 'vitest';
import {
  getDomainColorVar,
  getDomainPastelVar,
  getDomainColorVarRaw,
  getDomainPastelVarRaw,
  getDomainColorRich,
  getDomainColor,
  getDomainColorRichRaw,
  getDomainColorRaw,
} from './domainColors';

// DSN-1: getDomainColorVar/getDomainPastelVar (and their Raw counterparts)
// are the dark-mode-safe way to color anything by domain — they resolve to
// CSS custom properties that index.css overrides under `.dark`, instead of
// the static HSL baked into this file. These tests lock in two things a
// visual pass can't: that a recognized domain resolves to its matching CSS
// var name (so it actually differs light vs. dark), and that an
// unrecognized domain still falls back to the static color rather than
// producing an invalid CSS string.

describe('getDomainColorVar', () => {
  it('resolves each known domain to its rich CSS var', () => {
    expect(getDomainColorVar('Clinical')).toBe('hsl(var(--domain-clinical))');
    expect(getDomainColorVar('Clerical')).toBe('hsl(var(--domain-clerical))');
    expect(getDomainColorVar('Cultural')).toBe('hsl(var(--domain-cultural))');
    expect(getDomainColorVar('Case Acceptance')).toBe('hsl(var(--domain-case-acceptance))');
  });

  it('falls back to the static rich color for an unrecognized domain', () => {
    expect(getDomainColorVar('Not A Domain')).toBe(getDomainColorRich('Not A Domain'));
  });

  it('trims surrounding whitespace before matching', () => {
    expect(getDomainColorVar('  Clinical  ')).toBe('hsl(var(--domain-clinical))');
  });
});

describe('getDomainPastelVar', () => {
  it('resolves each known domain to its pastel CSS var', () => {
    expect(getDomainPastelVar('Clinical')).toBe('hsl(var(--domain-clinical-pastel))');
    expect(getDomainPastelVar('Clerical')).toBe('hsl(var(--domain-clerical-pastel))');
    expect(getDomainPastelVar('Cultural')).toBe('hsl(var(--domain-cultural-pastel))');
    expect(getDomainPastelVar('Case Acceptance')).toBe('hsl(var(--domain-case-acceptance-pastel))');
  });

  it('falls back to the static pastel color for an unrecognized domain', () => {
    expect(getDomainPastelVar('Not A Domain')).toBe(getDomainColor('Not A Domain'));
  });
});

describe('getDomainColorVarRaw', () => {
  it('resolves each known domain to a bare var() reference, for alpha composition', () => {
    expect(getDomainColorVarRaw('Clinical')).toBe('var(--domain-clinical)');
    expect(getDomainColorVarRaw('Case Acceptance')).toBe('var(--domain-case-acceptance)');
  });

  it('composes into a valid alpha-blended hsl() string', () => {
    expect(`hsl(${getDomainColorVarRaw('Clinical')} / 0.3)`).toBe('hsl(var(--domain-clinical) / 0.3)');
  });

  it('falls back to the static rich raw HSL triplet for an unrecognized domain', () => {
    expect(getDomainColorVarRaw('Not A Domain')).toBe(getDomainColorRichRaw('Not A Domain'));
  });
});

describe('getDomainPastelVarRaw', () => {
  it('resolves each known domain to a bare pastel var() reference', () => {
    expect(getDomainPastelVarRaw('Clinical')).toBe('var(--domain-clinical-pastel)');
    expect(getDomainPastelVarRaw('Case Acceptance')).toBe('var(--domain-case-acceptance-pastel)');
  });

  it('falls back to the static pastel raw HSL triplet for an unrecognized domain', () => {
    expect(getDomainPastelVarRaw('Not A Domain')).toBe(getDomainColorRaw('Not A Domain'));
  });
});
