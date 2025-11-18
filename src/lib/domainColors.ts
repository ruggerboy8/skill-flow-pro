// HSL colors for domains matching design system (raw components)
export const domainColors: Record<string, string> = {
  Clinical: '211 100% 92%',      // Light blue
  Clerical: '123 41% 88%',       // Light green
  Cultural: '354 70% 89%',       // Light pink
  'Case Acceptance': '36 100% 90%' // Light orange
};

// Returns raw HSL components for alpha blending
export const getDomainColorRaw = (domain: string): string => {
  const key = (domain || '').trim().toLowerCase();
  const map: Record<string, string> = {
    'clinical': domainColors.Clinical,
    'clerical': domainColors.Clerical,
    'cultural': domainColors.Cultural,
    'case acceptance': domainColors['Case Acceptance'],
  };
  return map[key] || '0 0% 95%'; // fallback to gray
};

// Returns fully qualified CSS color string
export const getDomainColor = (domain: string): string => {
  return `hsl(${getDomainColorRaw(domain)})`;
};