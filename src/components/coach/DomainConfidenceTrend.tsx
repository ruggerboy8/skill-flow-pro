import { useMemo } from 'react';
import { format, parseISO, subWeeks } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { getDomainColorRich } from '@/lib/domainColors';

interface ScoreRow {
  week_of: string;
  domain_name: string;
  confidence_score: number | null;
}

interface DomainConfidenceTrendProps {
  rawData: ScoreRow[];
  /** Number of weeks to look back. Defaults to 13. */
  lookbackWeeks?: number;
}

const DOMAINS = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'] as const;

export function DomainConfidenceTrend({ rawData, lookbackWeeks = 13 }: DomainConfidenceTrendProps) {
  const chartData = useMemo(() => {
    const cutoff = subWeeks(new Date(), lookbackWeeks);

    // Group rows by week, then by domain
    const byWeek = new Map<string, Map<string, { sum: number; count: number }>>();

    rawData.forEach(row => {
      if (row.confidence_score === null || !row.domain_name || !row.week_of) return;
      if (new Date(row.week_of) < cutoff) return;

      if (!byWeek.has(row.week_of)) {
        byWeek.set(row.week_of, new Map());
      }
      const weekMap = byWeek.get(row.week_of)!;
      const existing = weekMap.get(row.domain_name) ?? { sum: 0, count: 0 };
      existing.sum += row.confidence_score;
      existing.count += 1;
      weekMap.set(row.domain_name, existing);
    });

    // Convert to chart-friendly array sorted by week ascending
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekOf, domainMap]) => {
        const point: Record<string, string | number | null> = {
          week: format(parseISO(weekOf), 'MMM d'),
        };
        DOMAINS.forEach(domain => {
          const entry = domainMap.get(domain);
          point[domain] = entry ? parseFloat((entry.sum / entry.count).toFixed(2)) : null;
        });
        return point;
      });
  }, [rawData, lookbackWeeks]);

  const weekCount = chartData.length;

  if (weekCount < 4) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium mb-1">More data needed</p>
        <p>Domain confidence trends become meaningful after 4 or more weeks of check-ins.</p>
        <p className="mt-1 text-xs">
          {weekCount === 0 ? 'No data yet.' : `${weekCount} week${weekCount !== 1 ? 's' : ''} of data so far.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Self-reported confidence averages by domain · last {lookbackWeeks} weeks
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[1, 4]}
            ticks={[1, 2, 3, 4]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => [value?.toFixed(2) ?? '—', name]}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {DOMAINS.map(domain => (
            <Line
              key={domain}
              type="monotone"
              dataKey={domain}
              stroke={getDomainColorRich(domain)}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
