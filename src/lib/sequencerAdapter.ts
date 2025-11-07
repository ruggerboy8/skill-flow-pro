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

export function adaptSequencerRow(x: any): RankedMove {
  // The edge function already returns data in the correct camelCase format
  return {
    proMoveId: x.proMoveId,
    name: x.name,
    domainName: x.domainName,
    domainColorHsl: x.domainColorHsl,
    finalScore: isNaN(x.finalScore) ? 0 : x.finalScore,
    lowConfShare: x.lowConfShare ?? null,
    avgConfLast: x.avgConfLast ?? null,
    lastPracticedWeeks: x.lastPracticedWeeks ?? 999,
    retestDue: !!x.retestDue,
    primaryReasonCode: x.primaryReasonCode || 'TIE',
    primaryReasonValue: x.primaryReasonValue ?? null,
  };
}
