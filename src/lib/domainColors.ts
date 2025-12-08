// HSL colors for domains matching design system (raw components) - pastel versions
export const domainColors: Record<string, string> = {
  Clinical: '211 100% 92%',      // Light blue
  Clerical: '123 41% 88%',       // Light green
  Cultural: '354 70% 89%',       // Light pink
  'Case Acceptance': '36 100% 90%' // Light orange
};

// Rich/saturated HSL colors for glassmorphism backgrounds
export const domainColorsRich: Record<string, string> = {
  Clinical: '211 85% 55%',       // Stronger Blue
  Clerical: '123 60% 45%',       // Stronger Green
  Cultural: '330 85% 60%',       // Stronger Pink/Rose
  'Case Acceptance': '36 90% 55%' // Stronger Orange
};

// Returns raw HSL components for alpha blending (pastel)
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

// Returns raw HSL components for rich/saturated colors
export const getDomainColorRichRaw = (domain: string): string => {
  const key = (domain || '').trim().toLowerCase();
  const map: Record<string, string> = {
    'clinical': domainColorsRich.Clinical,
    'clerical': domainColorsRich.Clerical,
    'cultural': domainColorsRich.Cultural,
    'case acceptance': domainColorsRich['Case Acceptance'],
  };
  return map[key] || '0 0% 50%'; // fallback to gray
};

// Returns fully qualified CSS color string (pastel)
export const getDomainColor = (domain: string): string => {
  return `hsl(${getDomainColorRaw(domain)})`;
};

// Returns fully qualified CSS color string (rich)
export const getDomainColorRich = (domain: string): string => {
  return `hsl(${getDomainColorRichRaw(domain)})`;
};