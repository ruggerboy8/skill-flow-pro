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
  completedSubmissions: number;
  completionRate: number;
  onTimeSubmissions: number;
  onTimeRate: number;
  late: number;
  missing: number;
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

      // Call RPC to get all submission windows (including missing)
      const { data, error } = await supabase.rpc('get_staff_submission_windows', {
        p_staff_id: staffId,
        p_since: cutoffDate,
      });

      console.debug('OnTimeRateWidget: submission windows', {
        staffId,
        cutoffDate,
        rowCount: data?.length || 0,
        error: error?.message,
        sampleRow: data?.[0]
      });

      if (error) throw error;

      const now = new Date();
      const windows = data ?? [];
      const pastDueWindows = windows.filter((w: any) => new Date(w.due_at) <= now);

      // Group by week_of and metric
      const weekMetricMap = new Map<string, { 
        conf_submitted: boolean, 
        perf_submitted: boolean, 
        conf_on_time: boolean, 
        perf_on_time: boolean,
        conf_exists: boolean, 
        perf_exists: boolean 
      }>();
      
      pastDueWindows.forEach((w: any) => {
        const key = w.week_of;
        if (!weekMetricMap.has(key)) {
          weekMetricMap.set(key, { 
            conf_submitted: false, 
            perf_submitted: false, 
            conf_on_time: false, 
            perf_on_time: false,
            conf_exists: false, 
            perf_exists: false 
          });
        }
        const weekData = weekMetricMap.get(key)!;
        
        if (w.metric === 'confidence') {
          weekData.conf_exists = true;
          if (w.status === 'submitted') {
            weekData.conf_submitted = true;
            if (w.on_time === true) {
              weekData.conf_on_time = true;
            }
          }
        } else if (w.metric === 'performance') {
          weekData.perf_exists = true;
          if (w.status === 'submitted') {
            weekData.perf_submitted = true;
            if (w.on_time === true) {
              weekData.perf_on_time = true;
            }
          }
        }
      });

      // Calculate week-level stats
      let confCompleted = 0, confOnTime = 0, confTotal = 0;
      let perfCompleted = 0, perfOnTime = 0, perfTotal = 0;
      
      weekMetricMap.forEach((weekData) => {
        if (weekData.conf_exists) {
          confTotal++;
          if (weekData.conf_submitted) {
            confCompleted++;
            if (weekData.conf_on_time) confOnTime++;
          }
        }
        if (weekData.perf_exists) {
          perfTotal++;
          if (weekData.perf_submitted) {
            perfCompleted++;
            if (weekData.perf_on_time) perfOnTime++;
          }
        }
      });

      const totalExpected = confTotal + perfTotal;
      const completed = confCompleted + perfCompleted;
      const onTime = confOnTime + perfOnTime;
      const late = completed - onTime;
      const missing = totalExpected - completed;

      const completionRate = totalExpected > 0 ? (completed / totalExpected) * 100 : 0;
      const onTimeRate = completed > 0 ? (onTime / completed) * 100 : 0;

      setStats({
        totalSubmissions: totalExpected,
        completedSubmissions: completed,
        completionRate,
        onTimeSubmissions: onTime,
        onTimeRate,
        late,
        missing
      });
    } catch (error) {
      console.error('Error loading on-time stats:', error);
      setStats({ 
        totalSubmissions: 0, 
        completedSubmissions: 0, 
        completionRate: 0, 
        onTimeSubmissions: 0, 
        onTimeRate: 0, 
        late: 0, 
        missing: 0
      });
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
          <CardTitle className="text-lg">Submission Tracking</CardTitle>
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
            <CheckCircle2 className="w-5 h-5" />
            Submission Tracking
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
            <div className={`rounded-lg p-6 ${getRateBgColor(stats.completionRate)}`}>
              <div className={`text-4xl font-bold ${getRateColor(stats.completionRate)}`}>
                {stats.completionRate.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Completion</div>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm text-muted-foreground">
                  {stats.completedSubmissions} of {stats.totalSubmissions} completed
                  {stats.missing > 0 && `, ${stats.missing} missing`}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    stats.completionRate >= 90
                      ? 'bg-green-600'
                      : stats.completionRate >= 75
                      ? 'bg-yellow-600'
                      : 'bg-red-600'
                  }`}
                  style={{ width: `${stats.completionRate}%` }}
                />
              </div>
              {stats.completedSubmissions > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{stats.onTimeRate.toFixed(0)}%</span> on time ({stats.onTimeSubmissions} of {stats.completedSubmissions})
                    {stats.late > 0 && `, ${stats.late} late`}
                  </span>
                </div>
              )}
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
