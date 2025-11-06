// HSL colors for domains matching design system
export const domainColors: Record<string, string> = {
  Clinical: '211 100% 92%',      // Light blue
  Clerical: '123 41% 88%',       // Light green
  Cultural: '354 70% 89%',       // Light pink
  'Case Acceptance': '36 100% 90%' // Light orange
};

export const getDomainColor = (domain: string): string => {
  return domainColors[domain] || '0 0% 95%'; // fallback to gray
};