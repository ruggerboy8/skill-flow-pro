import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { buildOrganizationStaffScopeFilter } from '@/lib/clinicalDoctorScope';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus, X, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentRow {
  id: string;
  coach_staff_id: string;
  coach: { id: string; name: string } | null;
}

/**
 * Doctor coaching assignments (2026-08-06). Clinical directors assign learner
 * doctors to "doctor coaches" (typically owner doctors, e.g. Sprout's owners
 * coaching their associates). Having ≥1 assignment grants the coach a scoped
 * Clinical surface. Unassigned doctors are simply the CDs' to coach.
 */
export function DoctorCoachesCard({ doctorStaffId, doctorName }: { doctorStaffId: string; doctorName: string }) {
  const { isClinicalDirector, isSuperAdmin, organizationId, staffId } = useUserRole();
  const canManage = isClinicalDirector || isSuperAdmin;
  const queryClient = useQueryClient();
  const [selectedCoach, setSelectedCoach] = useState<string>('');

  const { data: assignments = [] } = useQuery({
    queryKey: ['doctor-coach-assignments', doctorStaffId],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from('doctor_coach_assignments' as any)
        .select('id, coach_staff_id, coach:staff!doctor_coach_assignments_coach_staff_id_fkey(id, name)')
        .eq('doctor_staff_id', doctorStaffId);
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
    enabled: !!doctorStaffId,
  });

  const { data: eligibleCoaches = [] } = useQuery({
    queryKey: ['doctor-coach-eligible', organizationId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      if (!organizationId) return [];
      const scopeFilter = await buildOrganizationStaffScopeFilter(organizationId);
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .eq('is_doctor', true)
        .or(scopeFilter)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: canManage && !!organizationId,
  });

  const assignedIds = new Set(assignments.map(a => a.coach_staff_id));
  const addable = eligibleCoaches.filter(c => c.id !== doctorStaffId && !assignedIds.has(c.id));

  const addMutation = useMutation({
    mutationFn: async (coachId: string) => {
      const { error } = await supabase
        .from('doctor_coach_assignments' as any)
        .insert({ doctor_staff_id: doctorStaffId, coach_staff_id: coachId, assigned_by: staffId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedCoach('');
      queryClient.invalidateQueries({ queryKey: ['doctor-coach-assignments', doctorStaffId] });
      queryClient.invalidateQueries({ queryKey: ['doctor-mentee-ids'] });
      queryClient.invalidateQueries({ queryKey: ['staff-profile'] });
      toast.success('Doctor coach assigned');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not assign coach'),
  });

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('doctor_coach_assignments' as any)
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-coach-assignments', doctorStaffId] });
      queryClient.invalidateQueries({ queryKey: ['doctor-mentee-ids'] });
      queryClient.invalidateQueries({ queryKey: ['staff-profile'] });
      toast.success('Assignment removed');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not remove assignment'),
  });

  // Nothing to show non-managers when there are no assignments.
  if (!canManage && assignments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5" />
          Doctor coaching
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No doctor coach assigned — the clinical directors coach {doctorName}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map(a => (
              <Badge key={a.id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5 text-sm font-normal">
                {a.coach?.name ?? 'Unknown'}
                {canManage && (
                  <button
                    aria-label={`Remove ${a.coach?.name ?? 'coach'}`}
                    onClick={() => removeMutation.mutate(a.id)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {canManage && (
          <div className="flex items-center gap-2">
            <Select value={selectedCoach} onValueChange={setSelectedCoach}>
              <SelectTrigger className="h-9 w-64">
                <SelectValue placeholder="Assign a doctor coach…" />
              </SelectTrigger>
              <SelectContent>
                {addable.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedCoach || addMutation.isPending}
              onClick={() => addMutation.mutate(selectedCoach)}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Assign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
