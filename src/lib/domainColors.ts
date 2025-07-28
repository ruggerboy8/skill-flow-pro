export const domainColors: Record<string, string> = {
  Clinical: '#c9daf8',
  Clerical: '#d9ead3',
  Cultural: '#e9a1a4',
  'Case Acceptance': '#fbe5cf'
};

export const getDomainColor = (domain: string): string => {
  return domainColors[domain] || '#f3f4f6'; // fallback to gray
};