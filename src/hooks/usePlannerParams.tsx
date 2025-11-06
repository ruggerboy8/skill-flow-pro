import { useSearchParams } from 'react-router-dom';
import { getNextMondayChicago, getChicagoMonday } from '@/lib/plannerUtils';

export type PlannerPreset = 'balanced' | 'confidence_recovery' | 'eval_focus' | 'variety_first';

export function usePlannerParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const asOfWeek = searchParams.get('week') || getNextMondayChicago();
  const preset = (searchParams.get('preset') as PlannerPreset) || 'balanced';

  const setAsOfWeek = (week: string) => {
    const monday = getChicagoMonday(week);
    setSearchParams(prev => {
      prev.set('week', monday);
      return prev;
    });
  };

  const setPreset = (newPreset: PlannerPreset) => {
    setSearchParams(prev => {
      prev.set('preset', newPreset);
      return prev;
    });
  };

  return {
    asOfWeek,
    preset,
    setAsOfWeek,
    setPreset,
  };
}
