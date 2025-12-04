import { useState, useEffect } from 'react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
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
  const [trajectory, setTrajectory] = useState<any>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [loadingTrajectory, setLoadingTrajectory] = useState(true);
  const [loadingCalibration, setLoadingCalibration] = useState(true);
  
  // Use staff profile which respects masquerade/simulation
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  
  const staff: Staff | null = staffProfile ? {
    id: staffProfile.id,
    role_id: staffProfile.role_id,
    primary_location_id: staffProfile.primary_location_id,
    timezone: (staffProfile.locations as any)?.timezone
  } : null;

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

  if (profileLoading || !staff) {
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