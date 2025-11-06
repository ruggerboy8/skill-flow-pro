import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, AlertTriangle, Clock, Lock, FileText, History, Zap } from 'lucide-react';
import { LockedWeekViewer } from './plan/LockedWeekViewer';
import { ProposedWeekEditor } from './plan/ProposedWeekEditor';
import { PlanHistory } from './plan/PlanHistory';
import { TimeTravelPanel } from './plan/TimeTravelPanel';
import { SequencerDevPanel } from './SequencerDevPanel';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, addWeeks } from 'date-fns';

const APP_TZ = 'America/Chicago';

interface GlobalPlanManagerProps {
  roleId: number;
  roleName: string;
}

interface HealthStatus {
  status: 'healthy' | 'warning' | 'error';
  lockedCount: number;
  proposedCount: number;
  message: string;
}

function mondayStrings(asOf?: string) {
  const now = asOf ? new Date(asOf) : new Date();
  const isoDow = Number(formatInTimeZone(now, APP_TZ, 'i'));
  const todayStr = formatInTimeZone(now, APP_TZ, 'yyyy-MM-dd');
  const todayMidnight = fromZonedTime(`${todayStr}T00:00:00`, APP_TZ);
  const localMonday = addDays(todayMidnight, -(isoDow - 1));
  const nextLocalMonday = addWeeks(localMonday, 1);
  const thisMondayStr = formatInTimeZone(localMonday, APP_TZ, 'yyyy-MM-dd');
  const nextMondayStr = formatInTimeZone(nextLocalMonday, APP_TZ, 'yyyy-MM-dd');
  return { thisMonday: thisMondayStr, nextMonday: nextMondayStr };
}

export function GlobalPlanManager({ roleId, roleName }: GlobalPlanManagerProps) {
  const { toast } = useToast();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { thisMonday, nextMonday } = mondayStrings();

  const checkHealth = async () => {
    try {
      // Check locked week (this Monday)
      const { data: lockedData, count: lockedCount } = await supabase
        .from('weekly_plan')
        .select('*', { count: 'exact' })
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', thisMonday)
        .eq('status', 'locked');

      // Check proposed week (next Monday)
      const { data: proposedData, count: proposedCount } = await supabase
        .from('weekly_plan')
        .select('*', { count: 'exact' })
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', nextMonday)
        .eq('status', 'proposed');

      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      let message = 'All systems operational';

      if (lockedCount !== 3) {
        status = 'error';
        message = `Missing or incomplete locked week (${lockedCount}/3 rows)`;
      } else if (proposedCount !== 3) {
        status = 'warning';
        message = `Missing or incomplete proposed week (${proposedCount}/3 rows)`;
      }

      setHealth({
        status,
        lockedCount: lockedCount || 0,
        proposedCount: proposedCount || 0,
        message
      });
    } catch (error: any) {
      console.error('[Health Check] Error:', error);
      setHealth({
        status: 'error',
        lockedCount: 0,
        proposedCount: 0,
        message: `Health check failed: ${error.message}`
      });
    }
  };

  useEffect(() => {
    checkHealth();
  }, [roleId, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    toast({ title: 'Refreshed', description: 'Plan data reloaded' });
  };

  const getHealthIcon = () => {
    if (!health) return null;
    switch (health.status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
  };

  const getHealthColor = () => {
    if (!health) return 'secondary';
    switch (health.status) {
      case 'healthy':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'error':
        return 'destructive';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Plan Manager - {roleName}</CardTitle>
        <CardDescription>
          Manage global weekly plans for {roleName} role • Using {APP_TZ} timezone
        </CardDescription>
        <div className="text-sm text-muted-foreground mt-2">
          This Monday: {thisMonday} • Next Monday: {nextMonday}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Status */}
        {health && (
          <Alert variant={health.status === 'error' ? 'destructive' : 'default'}>
            <div className="flex items-center gap-3">
              {getHealthIcon()}
              <div className="flex-1">
                <AlertDescription>
                  <strong>System Health:</strong> {health.message}
                  <div className="text-xs mt-1">
                    Locked: {health.lockedCount}/3 • Proposed: {health.proposedCount}/3
                  </div>
                </AlertDescription>
              </div>
              <Badge variant={getHealthColor()}>
                {health.status.toUpperCase()}
              </Badge>
            </div>
          </Alert>
        )}

        {/* Main Accordions */}
        <Accordion type="multiple" defaultValue={['locked', 'proposed']} className="w-full">
          {/* This Week (Locked) */}
          <AccordionItem value="locked">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                This Week (Locked) - {thisMonday}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <LockedWeekViewer
                roleId={roleId}
                weekStartDate={thisMonday}
                onRefresh={handleRefresh}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Next Week (Proposed) */}
          <AccordionItem value="proposed">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Next Week (Proposed) - {nextMonday}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ProposedWeekEditor
                roleId={roleId}
                weekStartDate={nextMonday}
                onRefresh={handleRefresh}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Sequencer Controls (Dev) */}
          <AccordionItem value="sequencer">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                <span>Sequencer Controls (Dev)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <SequencerDevPanel roleId={roleId} roleName={roleName} onRefresh={handleRefresh} />
            </AccordionContent>
          </AccordionItem>

          {/* History */}
          <AccordionItem value="history">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <span>Plan History</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <PlanHistory roleId={roleId} />
            </AccordionContent>
          </AccordionItem>

          {/* Time-Travel (Dev Tools) */}
          <AccordionItem value="timetravel">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Time Travel Panel (Dev)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <TimeTravelPanel
                roleId={roleId}
                roleName={roleName}
                onRefresh={handleRefresh}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
