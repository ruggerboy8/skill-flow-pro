export const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

export const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10;

export const getDomainOrderIndex = (domain: string): number => {
  const index = DOMAIN_ORDER.indexOf(domain);
  return index === -1 ? 999 : index;
};