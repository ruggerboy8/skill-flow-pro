import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import ConsistencyPanel from '@/components/stats/ConsistencyPanel';
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
  const [consistency, setConsistency] = useState<any>(null);
  const [trajectory, setTrajectory] = useState<any>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [loadingConsistency, setLoadingConsistency] = useState(true);
  const [loadingTrajectory, setLoadingTrajectory] = useState(true);
  const [loadingCalibration, setLoadingCalibration] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadStaffData();
    }
  }, [user]);

  useEffect(() => {
    if (staff) {
      loadConsistency();
      loadTrajectory();
      loadCalibration();
    }
  }, [staff]);

  const loadStaffData = async () => {
    if (!user) return;

    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select(`
          id,
          role_id,
          primary_location_id,
          locations!primary_location_id(timezone)
        `)
        .eq('user_id', user.id)
        .single();

      if (staffData) {
        setStaff({
          id: staffData.id,
          role_id: staffData.role_id,
          primary_location_id: staffData.primary_location_id,
          timezone: (staffData.locations as any)?.timezone
        });
      }
    } catch (error) {
      console.error('Error loading staff data:', error);
    }
  };

  const loadConsistency = async () => {
    if (!staff) return;

    try {
      const { data } = await supabase.rpc('get_consistency', {
        p_staff_id: staff.id,
        p_weeks: 6,
        p_tz: staff.timezone || 'America/Chicago'
      });

      setConsistency(data);
    } catch (error) {
      console.error('Error loading consistency data:', error);
    } finally {
      setLoadingConsistency(false);
    }
  };

  const loadTrajectory = async () => {
    if (!staff) return;

    try {
      const { data } = await supabase.rpc('get_performance_trend', {
        p_staff_id: staff.id,
        p_role_id: staff.role_id,
        p_window: 6
      });

      setTrajectory(data);
    } catch (error) {
      console.error('Error loading trajectory data:', error);
    } finally {
      setLoadingTrajectory(false);
    }
  };

  const loadCalibration = async () => {
    if (!staff) return;

    try {
      const { data } = await supabase.rpc('get_calibration', {
        p_staff_id: staff.id,
        p_role_id: staff.role_id,
        p_window: 6
      });

      setCalibration(data);
    } catch (error) {
      console.error('Error loading calibration data:', error);
    } finally {
      setLoadingCalibration(false);
    }
  };

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
      <ConsistencyPanel data={consistency} loading={loadingConsistency} />
      <PerformanceTrajectoryPanel data={trajectory} loading={loadingTrajectory} />
      <CalibrationPanel data={calibration} loading={loadingCalibration} />
    </div>
  );
}