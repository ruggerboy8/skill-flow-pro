import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface OnTimeRateWidgetProps {
  staffId: string;
}

type TimeFilter = '3weeks' | '6weeks' | 'all';

interface SubmissionStats {
  totalSubmissions: number;
  onTimeSubmissions: number;
  rate: number;
}

export default function OnTimeRateWidget({ staffId }: OnTimeRateWidgetProps) {
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [staffId, filter]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Calculate cutoff date based on filter
      let cutoffDate: string | null = null;
      if (filter === '3weeks') {
        const date = new Date();
        date.setDate(date.getDate() - 21);
        cutoffDate = date.toISOString().split('T')[0];
      } else if (filter === '6weeks') {
        const date = new Date();
        date.setDate(date.getDate() - 42);
        cutoffDate = date.toISOString().split('T')[0];
      }

      // Build query
      let query = supabase
        .from('weekly_scores')
        .select('confidence_score, confidence_late, performance_score, performance_late, confidence_date, performance_date')
        .eq('staff_id', staffId);

      if (cutoffDate) {
        query = query.or(`confidence_date.gte.${cutoffDate},performance_date.gte.${cutoffDate}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate stats
      let totalSubmissions = 0;
      let onTimeSubmissions = 0;

      data?.forEach(row => {
        // Count confidence submissions
        if (row.confidence_score !== null) {
          totalSubmissions++;
          if (!row.confidence_late) {
            onTimeSubmissions++;
          }
        }

        // Count performance submissions
        if (row.performance_score !== null) {
          totalSubmissions++;
          if (!row.performance_late) {
            onTimeSubmissions++;
          }
        }
      });

      const rate = totalSubmissions > 0 ? (onTimeSubmissions / totalSubmissions) * 100 : 0;

      setStats({
        totalSubmissions,
        onTimeSubmissions,
        rate
      });
    } catch (error) {
      console.error('Error loading on-time stats:', error);
      setStats({ totalSubmissions: 0, onTimeSubmissions: 0, rate: 0 });
    } finally {
      setLoading(false);
    }
  };

  const getRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRateBgColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-50 dark:bg-green-950/20';
    if (rate >= 75) return 'bg-yellow-50 dark:bg-yellow-950/20';
    return 'bg-red-50 dark:bg-red-950/20';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">On-Time Submission Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            On-Time Submission Rate
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={filter === '3weeks' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('3weeks')}
            >
              Last 3 Weeks
            </Button>
            <Button
              variant={filter === '6weeks' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('6weeks')}
            >
              Last 6 Weeks
            </Button>
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All Time
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stats && stats.totalSubmissions > 0 ? (
          <div className="flex items-center gap-6">
            <div className={`rounded-lg p-6 ${getRateBgColor(stats.rate)}`}>
              <div className={`text-4xl font-bold ${getRateColor(stats.rate)}`}>
                {stats.rate.toFixed(0)}%
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm text-muted-foreground">
                  {stats.onTimeSubmissions} of {stats.totalSubmissions} submissions on time
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    stats.rate >= 90
                      ? 'bg-green-600'
                      : stats.rate >= 75
                      ? 'bg-yellow-600'
                      : 'bg-red-600'
                  }`}
                  style={{ width: `${stats.rate}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No submissions found for this time period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
