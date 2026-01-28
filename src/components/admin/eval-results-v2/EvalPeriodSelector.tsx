import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateEvalPeriods, formatEvalPeriod, periodToString, parsePeriodFromString } from '@/lib/evalPeriods';
import type { EvaluationPeriod } from '@/lib/evalPeriods';

interface EvalPeriodSelectorProps {
  value: EvaluationPeriod | null;
  onChange: (period: EvaluationPeriod) => void;
  /** Whether to show all periods even if no data exists */
  showAllPeriods?: boolean;
  className?: string;
}

export function EvalPeriodSelector({ 
  value, 
  onChange,
  showAllPeriods = true,
  className 
}: EvalPeriodSelectorProps) {
  // Generate periods from 2025 to current year + 1
  const currentYear = new Date().getFullYear();
  const periods = generateEvalPeriods(2025, currentYear + 1);
  
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
