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

// CSS-var-backed variants that track light/dark mode live.
//
// DSN-1 (2026-08-19): this comment used to say getDomainColor/getDomainColorRich
// "intentionally stay static-fallback-only" so RoleRadar, DomainDetail and
// CompetencyAccordion "render byte-identically," citing
// docs/features/explore-my-role-build-instructions.md section D. That
// constraint was scoped to one build (E1+E2 of the Explore/Craft Atlas
// rebuild): the instruction was "desktop is untouched" so the *mobile-only*
// rebuild couldn't regress the *desktop* RoleRadar it wasn't supposed to
// touch, not a standing rule that these three screens can never move to the
// var-backed getters.
//
// Verified before migrating any call site: the :root (light) values of
// every --domain-*/-pastel custom property in index.css are byte-identical
// to the domainColors/domainColorsRich constants above, so swapping a call
// site from getDomainColor()/getDomainColorRich() to
// getDomainPastelVar()/getDomainColorVar() changes nothing in light mode —
// same computed HSL, same rendered pixels. It only starts responding to the
// .dark overrides, which today never activate (nothing in the app ever adds
// a `dark` class — darkMode is class-based in tailwind.config.ts, and no
// ThemeProvider/toggle sets it, even though next-themes is installed and
// several screens already carry dormant `dark:` Tailwind classes). So this
// migration is a no-op today and becomes correct the day a dark-mode toggle
// ships, instead of needing another sweep then. Under DSN-1, RoleRadar,
// ThisWeekPanel, the eval-results-v2 surface, the coach evaluation/dashboard
// screens, and the doctor/clinical screens have been migrated to these
// var-backed getters. DomainDetail.tsx and CompetencyAccordion.tsx are NOT
// migrated yet — they still call the static helpers directly — because
// their alpha-blended gradient composition needs closer review than a
// mechanical swap; they're in the deferred set for a follow-up ticket. See
// the DSN-1 ticket report for the full list migrated vs. deferred.
export const getDomainColorVar = (domain: string): string => {
  const varName = DOMAIN_CSS_VARS[(domain || '').trim()];
  return varName ? `hsl(var(${varName}))` : getDomainColorRich(domain);
};

export const getDomainPastelVar = (domain: string): string => {
  const varName = DOMAIN_CSS_VARS_PASTEL[(domain || '').trim()];
  return varName ? `hsl(var(${varName}))` : getDomainColor(domain);
};

// Bare var() reference (no hsl() wrapper), for call sites that need to
// compose an alpha value, e.g. `hsl(${getDomainColorVarRaw(domain)} / 0.3)`.
// Mirrors getDomainColorRichRaw's fallback for an unrecognized domain.
export const getDomainColorVarRaw = (domain: string): string => {
  const varName = DOMAIN_CSS_VARS[(domain || '').trim()];
  return varName ? `var(${varName})` : getDomainColorRichRaw(domain);
};

// Bare var() reference (no hsl() wrapper) for the pastel domain color.
// Mirrors getDomainColorRaw's fallback for an unrecognized domain.
export const getDomainPastelVarRaw = (domain: string): string => {
  const varName = DOMAIN_CSS_VARS_PASTEL[(domain || '').trim()];
  return varName ? `var(${varName})` : getDomainColorRaw(domain);
};

// Readable ink tokens for text sitting on a domain's pastel/tinted
// background (see --clinical-ink etc. in index.css, mobile-shell round).
const DOMAIN_INK_VARS: Record<string, string> = {
  'clinical': '--clinical-ink',
  'clerical': '--clerical-ink',
  'cultural': '--cultural-ink',
  'case acceptance': '--case-acceptance-ink',
};

// Returns fully qualified CSS color string for on-pastel text
export const getDomainInk = (domain: string): string => {
  const key = (domain || '').trim().toLowerCase();
  return `hsl(var(${DOMAIN_INK_VARS[key] || '--foreground'}))`;
};
