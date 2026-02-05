import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ClipboardCheck, Clock, UserPlus, Stethoscope, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { InviteDoctorDialog } from '@/components/clinical/InviteDoctorDialog';

interface DoctorStats {
  total: number;
  completed: number;
  inProgress: number;
  invited: number;
}

export default function ClinicalHome() {
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['doctor-stats'],
    queryFn: async (): Promise<DoctorStats> => {
      // Get all doctors
      const { data: doctors, error: doctorsErr } = await supabase
        .from('staff')
        .select('id')
        .eq('is_doctor', true);
      
      if (doctorsErr) throw doctorsErr;
      
      const doctorIds = doctors?.map(d => d.id) || [];
      
      if (doctorIds.length === 0) {
        return { total: 0, completed: 0, inProgress: 0, invited: 0 };
      }
      
      // Get baseline statuses
      const { data: baselines, error: baselineErr } = await supabase
        .from('doctor_baseline_assessments')
        .select('doctor_staff_id, status')
        .in('doctor_staff_id', doctorIds);
      
      if (baselineErr) throw baselineErr;
      
      const baselineMap = new Map(baselines?.map(b => [b.doctor_staff_id, b.status]) || []);
      
      let completed = 0;
      let inProgress = 0;
      let invited = 0;
      
      for (const id of doctorIds) {
        const status = baselineMap.get(id);
        if (status === 'completed') {
          completed++;
        } else if (status === 'in_progress') {
          inProgress++;
        } else {
          invited++;
        }
      }
      
      return { total: doctorIds.length, completed, inProgress, invited };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clinical Director Portal</h1>
          <p className="text-muted-foreground">Manage doctor onboarding and development</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Doctor
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Doctors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : stats?.total ?? 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Baseline Complete</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{isLoading ? '—' : stats?.completed ?? 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{isLoading ? '—' : stats?.inProgress ?? 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invited</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{isLoading ? '—' : stats?.invited ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow">
          <Link to="/clinical/doctors">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Stethoscope className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Doctor Management</CardTitle>
                  <CardDescription>View and manage all doctors</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>
        
        <Card className="hover:shadow-md transition-shadow">
          <Link to="/clinical/pro-moves">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Doctor Pro Moves</CardTitle>
                  <CardDescription>Manage doctor-specific pro moves</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Link>
        </Card>
      </div>

      <InviteDoctorDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}