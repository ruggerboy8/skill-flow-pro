// Adapter to map sequencer edge function response to UI types

export interface RankedMove {
  proMoveId: number;
  name: string;
  domainName: string;
  domainColorHsl: string;
  finalScore: number;
  lowConfShare: number | null;
  avgConfLast: number | null;
  lastPracticedWeeks: number;
  retestDue: boolean;
  primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE';
  primaryReasonValue: number | null;
}

function hexToHslString(hex?: string): string {
  if (!hex) return '0, 0%, 50%';
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const vmax = Math.max(r, g, b);
  const vmin = Math.min(r, g, b);
  const d = vmax - vmin;
  let h = 0;
  let s = 0;
  let l = (vmax + vmin) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (vmax) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

export function adaptSequencerRow(x: any): RankedMove {
  return {
    proMoveId: x.action_id,
    name: x.title,
    domainName: x.domain_name,
    domainColorHsl: hexToHslString(x.domain_color),
    finalScore: isNaN(x.final_score ?? x.needScore) ? 0 : (x.final_score ?? x.needScore),
    lowConfShare: x.low_conf_share ?? null,
    avgConfLast: x.avg_conf_last ?? null,
    lastPracticedWeeks: x.weeks_since_last ?? 999,
    retestDue: !!x.retest_due,
    primaryReasonCode: x.primary_reason_code || 'TIE',
    primaryReasonValue: x.primary_reason_value ?? null,
  };
}
