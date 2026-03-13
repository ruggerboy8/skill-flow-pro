// Domain color system — single source of truth
// CSS custom properties are defined in index.css (--domain-clinical, etc.)

// CSS var names for each domain (rich/saturated versions)
export const DOMAIN_CSS_VARS: Record<string, string> = {
  Clinical: '--domain-clinical',
  Clerical: '--domain-clerical',
  Cultural: '--domain-cultural',
  'Case Acceptance': '--domain-case-acceptance',
};

// CSS var names for pastel versions
export const DOMAIN_CSS_VARS_PASTEL: Record<string, string> = {
  Clinical: '--domain-clinical-pastel',
  Clerical: '--domain-clerical-pastel',
  Cultural: '--domain-cultural-pastel',
  'Case Acceptance': '--domain-case-acceptance-pastel',
};

// Fallback HSL values (used when CSS vars aren't available, e.g. SSR)
export const domainColors: Record<string, string> = {
  Clinical: '211 100% 92%',
  Clerical: '123 41% 88%',
  Cultural: '354 70% 89%',
  'Case Acceptance': '36 100% 90%',
};

export const domainColorsRich: Record<string, string> = {
  Clinical: '211 85% 55%',
  Clerical: '123 60% 45%',
  Cultural: '330 85% 60%',
  'Case Acceptance': '36 90% 55%',
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
  return map[key] || '0 0% 95%';
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
  return map[key] || '0 0% 50%';
};

// Returns fully qualified CSS color string (pastel)
export const getDomainColor = (domain: string): string => {
  return `hsl(${getDomainColorRaw(domain)})`;
};

// Returns fully qualified CSS color string (rich)
export const getDomainColorRich = (domain: string): string => {
  return `hsl(${getDomainColorRichRaw(domain)})`;
};
