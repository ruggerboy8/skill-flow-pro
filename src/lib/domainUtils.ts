export const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

export const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10;

export const getDomainOrderIndex = (domain: string): number => {
  const index = DOMAIN_ORDER.indexOf(domain);
  return index === -1 ? 999 : index;
};

// Slug utilities for domain detail routes
export const DOMAIN_SLUGS: Record<string, number> = {
  'clinical': 1,
  'clerical': 2,
  'cultural': 3,
  'case-acceptance': 4
};

export const DOMAIN_ID_TO_NAME: Record<number, string> = {
  1: 'Clinical',
  2: 'Clerical',
  3: 'Cultural',
  4: 'Case Acceptance'
};

export const getDomainSlug = (domainName: string): string =>
  domainName.toLowerCase().replace(/\s+/g, '-');

export const getDomainIdFromSlug = (slug: string): number | null =>
  DOMAIN_SLUGS[slug] ?? null;

export const getDomainNameFromSlug = (slug: string): string | null => {
  const id = DOMAIN_SLUGS[slug];
  return id ? DOMAIN_ID_TO_NAME[id] : null;
};