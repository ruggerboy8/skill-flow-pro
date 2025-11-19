import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import PerformanceTrajectoryPanel from '@/components/stats/PerformanceTrajectoryPanel';
import CalibrationPanel from '@/components/stats/CalibrationPanel';

interface Staff {
  id: string;
  role_id: number;
  primary_location_id: string;
  timezone?: string;
}

export default function AtAGlance() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [trajectory, setTrajectory] = useState<any>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [loadingTrajectory, setLoadingTrajectory] = useState(true);
  const [loadingCalibration, setLoadingCalibration] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select(`
            id, role_id, primary_location_id,
            locations!primary_location_id(timezone)
          `)
          .eq('user_id', user.id)
          .single();

        if (!staffData || cancelled) return;

        setStaff({
          id: staffData.id,
          role_id: staffData.role_id,
          primary_location_id: staffData.primary_location_id,
          timezone: (staffData.locations as any)?.timezone
        });
      } catch (e) {
        if (!cancelled) console.error('Error loading staff data:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!staff) return;
    let cancelled = false;

    const run = async () => {
      try {
        const [{ data: t }, { data: k }] = await Promise.all([
          supabase.rpc('get_performance_trend', { p_staff_id: staff.id, p_role_id: staff.role_id, p_window: 6 }),
          supabase.rpc('get_calibration', { p_staff_id: staff.id, p_role_id: staff.role_id, p_window: 6 }),
        ]);
        if (cancelled) return;
        setTrajectory(t); setCalibration(k);
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) { setLoadingTrajectory(false); setLoadingCalibration(false); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [staff]);

  if (!staff) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OnTimeRateWidget staffId={staff.id} />
      <PerformanceTrajectoryPanel data={trajectory} loading={loadingTrajectory} />
      <CalibrationPanel data={calibration} loading={loadingCalibration} />
    </div>
  );
}