import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LocationExcuse {
  id: string;
  location_id: string;
  week_of: string;
  metric: 'confidence' | 'performance';
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

interface ExcuseStatus {
  isConfExcused: boolean;
  isPerfExcused: boolean;
  confReason: string | null;
  perfReason: string | null;
}

export function useLocationExcuses(weekOf: string) {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isOrgAdmin } = useAuth();
  const canManage = isSuperAdmin || isOrgAdmin;

  // Fetch all location excuses for the given week
  const { data: excuses = [], isLoading, error } = useQuery({
    queryKey: ['location-excuses', weekOf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('excused_locations')
        .select('*')
        .eq('week_of', weekOf);

      if (error) throw error;
      return data as LocationExcuse[];
    },
    enabled: !!weekOf,
  });

  // Get excuse status for a specific location
  const getExcuseStatus = (locationId: string): ExcuseStatus => {
    const locationExcuses = excuses.filter(e => e.location_id === locationId);
    const confExcuse = locationExcuses.find(e => e.metric === 'confidence');
    const perfExcuse = locationExcuses.find(e => e.metric === 'performance');

    return {
      isConfExcused: !!confExcuse,
      isPerfExcused: !!perfExcuse,
      confReason: confExcuse?.reason ?? null,
      perfReason: perfExcuse?.reason ?? null,
    };
  };

  // Toggle a single metric excuse
  const toggleExcuseMutation = useMutation({
    mutationFn: async ({ 
      locationId, 
      metric, 
      reason 
    }: { 
      locationId: string; 
      metric: 'confidence' | 'performance'; 
      reason?: string;
    }) => {
      const existing = excuses.find(
        e => e.location_id === locationId && e.metric === metric
      );

      if (existing) {
        // Remove the excuse
        const { error } = await supabase
          .from('excused_locations')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        return { action: 'removed', metric };
      } else {
        // Add the excuse
        const { error } = await supabase
          .from('excused_locations')
          .insert({
            location_id: locationId,
            week_of: weekOf,
            metric,
            reason: reason || null,
          });
        if (error) throw error;
        return { action: 'added', metric };
      }
    },
    onSuccess: (result) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['location-excuses'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-windows'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-rates-batch'] });
      queryClient.invalidateQueries({ queryKey: ['location-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['org-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['staff-weekly-scores'] });

      const metricLabel = result.metric === 'confidence' ? 'Confidence' : 'Performance';
      if (result.action === 'added') {
        toast.success(`${metricLabel} excused for this location`);
      } else {
        toast.success(`${metricLabel} excuse removed`);
      }
    },
    onError: (error) => {
      console.error('Error toggling location excuse:', error);
      toast.error('Failed to update location excuse');
    },
  });

  // Excuse both metrics at once
  const excuseBothMutation = useMutation({
    mutationFn: async ({ 
      locationId, 
      reason 
    }: { 
      locationId: string; 
      reason?: string;
    }) => {
      const status = getExcuseStatus(locationId);
      const toInsert: Array<{ location_id: string; week_of: string; metric: string; reason: string | null }> = [];

      if (!status.isConfExcused) {
        toInsert.push({
          location_id: locationId,
          week_of: weekOf,
          metric: 'confidence',
          reason: reason || null,
        });
      }
      if (!status.isPerfExcused) {
        toInsert.push({
          location_id: locationId,
          week_of: weekOf,
          metric: 'performance',
          reason: reason || null,
        });
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('excused_locations')
          .insert(toInsert);
        if (error) throw error;
      }

      return { count: toInsert.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-excuses'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-windows'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-rates-batch'] });
      queryClient.invalidateQueries({ queryKey: ['location-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['org-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['staff-weekly-scores'] });
      toast.success('Location fully excused for this week');
    },
    onError: (error) => {
      console.error('Error excusing location:', error);
      toast.error('Failed to excuse location');
    },
  });

  // Remove all excuses for a location
  const removeAllExcusesMutation = useMutation({
    mutationFn: async ({ locationId }: { locationId: string }) => {
      const { error } = await supabase
        .from('excused_locations')
        .delete()
        .eq('location_id', locationId)
        .eq('week_of', weekOf);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-excuses'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-windows'] });
      queryClient.invalidateQueries({ queryKey: ['staff-submission-rates-batch'] });
      queryClient.invalidateQueries({ queryKey: ['location-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['org-accountability'] });
      queryClient.invalidateQueries({ queryKey: ['staff-weekly-scores'] });
      toast.success('All excuses removed for this location');
    },
    onError: (error) => {
      console.error('Error removing excuses:', error);
      toast.error('Failed to remove excuses');
    },
  });

  return {
    excuses,
    isLoading,
    error,
    getExcuseStatus,
    canManage,
    toggleExcuse: toggleExcuseMutation.mutate,
    excuseBoth: excuseBothMutation.mutate,
    removeAllExcuses: removeAllExcusesMutation.mutate,
    isToggling: toggleExcuseMutation.isPending,
    isExcusingBoth: excuseBothMutation.isPending,
    isRemovingAll: removeAllExcusesMutation.isPending,
  };
}
