import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, HelpCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeToPlannerWeek, formatWeekOf } from '@/lib/plannerUtils';
import { cn } from '@/lib/utils';

interface MonthViewProps {
  roleId: number;
  selectedMonthAnchor: string;
  onSelectWeek: (monday: string) => void;
}

interface WeekStatus {
  monday: string;
  isScheduled: boolean;
}

export function MonthView({ roleId, selectedMonthAnchor, onSelectWeek }: MonthViewProps) {
  const [weeks, setWeeks] = useState<WeekStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMonthData();
  }, [roleId, selectedMonthAnchor]);

  const getMondaysInMonth = (monthStartStr: string): string[] => {
    const mondays: string[] = [];
    const date = new Date(monthStartStr + 'T12:00:00');
    
    // Find first Monday of month
    while (date.getDay() !== 1 && date.getDate() <= 7) {
      date.setDate(date.getDate() + 1);
    }
    
    // Collect all Mondays in this month
    const targetMonth = date.getMonth();
    while (date.getMonth() === targetMonth) {
      mondays.push(date.toISOString().split('T')[0]);
      date.setDate(date.getDate() + 7);
    }
    
    return mondays;
  };

  const loadMonthData = async () => {
    setLoading(true);
    
    const mondays = getMondaysInMonth(selectedMonthAnchor);
    
    // Simple query: just check existence of weekly_plan rows
    const { data, error } = await supabase
      .from('weekly_plan')
      .select('week_start_date')
      .is('org_id', null)
      .eq('role_id', roleId)
      .in('week_start_date', mondays);
    
    if (error) {
      console.error('[MonthView] Load error:', error);
      setLoading(false);
      return;
    }
    
    // Build scheduled set
    const scheduledSet = new Set(data.map(r => r.week_start_date));
    
    const weekData = mondays.map(monday => ({
      monday,
      isScheduled: scheduledSet.has(monday),
    }));
    
    setWeeks(weekData);
    setLoading(false);
  };

  const currentMonday = normalizeToPlannerWeek(new Date());

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : weeks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No weeks in this month
          </div>
        ) : (
          weeks.map(week => {
            const isPast = week.monday < currentMonday;
            
            return (
              <button
                key={week.monday}
                onClick={() => onSelectWeek(week.monday)}
                className={cn(
                  "w-full flex items-center justify-between",
                  "px-4 py-3 rounded-lg border transition-colors",
                  "hover:bg-accent",
                  week.isScheduled 
                    ? "bg-background" 
                    : "bg-muted/40 opacity-70",
                  isPast && !week.isScheduled && "opacity-50"
                )}
              >
                <span className="text-sm font-medium">
                  Week of {formatWeekOf(week.monday)}
                </span>
                {week.isScheduled ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
