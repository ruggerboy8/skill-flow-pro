import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatEvalPeriod, periodToString, parsePeriodFromString } from '@/lib/evalPeriods';
import { supabase } from '@/integrations/supabase/client';
import type { EvaluationPeriod, Quarter } from '@/lib/evalPeriods';

interface EvalPeriodSelectorProps {
  value: EvaluationPeriod | null;
  onChange: (period: EvaluationPeriod) => void;
  className?: string;
}

export function EvalPeriodSelector({ 
  value, 
  onChange,
  className 
}: EvalPeriodSelectorProps) {
  // Fetch distinct periods that have evaluations
  const { data: periods = [] } = useQuery({
    queryKey: ['eval-periods-with-data'],
    queryFn: async (): Promise<EvaluationPeriod[]> => {
      // Get distinct type/quarter/year combinations from evaluations
      const { data, error } = await supabase
        .from('evaluations')
        .select('type, quarter, program_year')
        .order('program_year', { ascending: false });

      if (error) throw error;

      // Build unique periods
      const periodSet = new Set<string>();
      const result: EvaluationPeriod[] = [];
      
      // Always add Baseline at the top
      result.push({ type: 'Baseline', year: new Date().getFullYear() });
      periodSet.add('Baseline');

      // Add quarterly periods from the data (most recent first)
      for (const row of data || []) {
        if (row.type === 'Quarterly' && row.quarter) {
          const key = `${row.quarter}-${row.program_year}`;
          if (!periodSet.has(key)) {
            periodSet.add(key);
            result.push({ 
              type: 'Quarterly', 
              quarter: row.quarter as Quarter, 
              year: row.program_year 
            });
          }
        }
      }

      // Sort quarterly periods by year desc, then quarter desc
      const baseline = result[0];
      const quarterly = result.slice(1).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        const qOrder = { Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
        return qOrder[b.quarter!] - qOrder[a.quarter!];
      });

      return [baseline, ...quarterly];
    },
    staleTime: 60000 // Cache for 1 minute
  });

  const handleChange = (stringValue: string) => {
    const parsed = parsePeriodFromString(stringValue);
    if (parsed) {
      onChange(parsed);
    }
  };

  return (
    <Select 
      value={value ? periodToString(value) : undefined} 
      onValueChange={handleChange}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select period">
          {value ? formatEvalPeriod(value) : 'Select period'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {periods.map(period => (
          <SelectItem 
            key={periodToString(period)} 
            value={periodToString(period)}
          >
            {formatEvalPeriod(period)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
