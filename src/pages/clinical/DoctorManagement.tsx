import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Mail, MoreHorizontal, Users, ClipboardCheck, Clock, ArrowRight, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { InviteDoctorDialog } from '@/components/clinical/InviteDoctorDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { getDoctorJourneyStatus, type DoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';

interface DoctorRow {
  id: string;
  name: string;
  email: string;
  location_name: string | null;
  created_at: string;
  journeyStatus: DoctorJourneyStatus;
  nextMeeting: string | null;
}

type FilterValue = 'all' | 'needs_my_action' | 'waiting_on_doctor';

export default function DoctorManagement() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>('all');
  const navigate = useNavigate();

  const { data: doctors, isLoading, refetch } = useQuery({
    queryKey: ['doctors-management'],
    queryFn: async (): Promise<DoctorRow[]> => {
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select(`id, name, email, created_at, baseline_released_at, locations (name)`)
        .eq('is_doctor', true)
        .order('name');
      
      if (staffErr) throw staffErr;
      
      const doctorIds = staffData?.map(d => d.id) || [];
      if (doctorIds.length === 0) return [];
      
      const [baselinesRes, coachBaselinesRes, sessionsRes] = await Promise.all([
        supabase
          .from('doctor_baseline_assessments')
          .select('doctor_staff_id, status, completed_at')
          .in('doctor_staff_id', doctorIds),
        supabase
          .from('coach_baseline_assessments')
          .select('doctor_staff_id, status')
          .in('doctor_staff_id', doctorIds),
        supabase
          .from('coaching_sessions')
          .select('id, doctor_staff_id, session_type, sequence_number, status, scheduled_at')
          .in('doctor_staff_id', doctorIds)
          .order('sequence_number', { ascending: false }),
      ]);

      if (baselinesRes.error) throw baselinesRes.error;
      if (coachBaselinesRes.error) throw coachBaselinesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      const baselineMap = new Map(baselinesRes.data?.map(b => [b.doctor_staff_id, b]) || []);
      const coachBaselineMap = new Map(coachBaselinesRes.data?.map(b => [b.doctor_staff_id, b]) || []);
      
      const sessionsMap = new Map<string, typeof sessionsRes.data>();
      for (const s of sessionsRes.data || []) {
        if (!sessionsMap.has(s.doctor_staff_id)) sessionsMap.set(s.doctor_staff_id, []);
        sessionsMap.get(s.doctor_staff_id)!.push(s);
      }

      return (staffData || []).map(s => {
        const baseline = baselineMap.get(s.id);
        const coachBaseline = coachBaselineMap.get(s.id);
        const sessions = sessionsMap.get(s.id) || [];
        const journeyStatus = getDoctorJourneyStatus(
          baseline ? { status: baseline.status, completed_at: baseline.completed_at } : null,
          coachBaseline ? { status: coachBaseline.status } : null,
          sessions,
          (s as any).baseline_released_at,
        );

        const upcomingSessions = sessions
          .filter(sess => ['scheduled', 'director_prep_ready', 'doctor_prep_submitted'].includes(sess.status))
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

        return {
          id: s.id,
          name: s.name,
          email: s.email,
          location_name: (s.locations as any)?.name || null,
          created_at: s.created_at || '',
          journeyStatus,
          nextMeeting: upcomingSessions[0]?.scheduled_at || null,
        };
      });
    },
  });

  // Compute stats from doctors data
  const stats = doctors ? {
    total: doctors.length,
    completed: doctors.filter(d => ['baseline_submitted', 'ready_for_prep', 'prep_complete', 'scheduling_invite_sent', 'meeting_ready', 'meeting_pending', 'doctor_confirmed', 'followup_scheduled', 'followup_completed'].includes(d.journeyStatus.stage)).length,
    inProgress: doctors.filter(d => d.journeyStatus.stage === 'baseline_in_progress').length,
    invited: doctors.filter(d => ['invited', 'baseline_released'].includes(d.journeyStatus.stage)).length,
  } : null;

  const filteredDoctors = doctors?.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'needs_my_action') {
      return ['baseline_submitted', 'ready_for_prep', 'prep_complete', 'doctor_confirmed', 'followup_completed'].includes(d.journeyStatus.stage);
    }
    if (filter === 'waiting_on_doctor') {
      return ['invited', 'baseline_in_progress', 'baseline_released', 'meeting_pending', 'scheduling_invite_sent'].includes(d.journeyStatus.stage);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clinical Director Portal</h1>
          <p className="text-muted-foreground">Manage doctor onboarding and development</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/clinical/pro-moves')}>
            <BookOpen className="w-4 h-4 mr-2" />
            Pro Moves Library
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite Doctor
          </Button>
        </div>
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
            <ClipboardCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{isLoading ? '—' : stats?.completed ?? 0}</div>
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

      {/* Doctor List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>All Doctors</CardTitle>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Doctors</SelectItem>
              <SelectItem value="needs_my_action">Needs My Action</SelectItem>
              <SelectItem value="waiting_on_doctor">Waiting on Doctor</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredDoctors?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No doctors found.</p>
              {filter === 'all' && (
                <Button className="mt-4" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Your First Doctor
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Next Step</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Next Meeting</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDoctors?.map((doctor) => (
                  <TableRow 
                    key={doctor.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/clinical/doctors/${doctor.id}`)}
                  >
                    <TableCell>
                      <div>
                        <span className="font-medium">{doctor.name}</span>
                        <p className="text-xs text-muted-foreground">{doctor.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {doctor.location_name || (
                        <span className="text-muted-foreground italic">Roaming</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DoctorJourneyStatusPill status={doctor.journeyStatus} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{doctor.journeyStatus.nextAction}</span>
                    </TableCell>
                    <TableCell>
                      <InlineAction stage={doctor.journeyStatus.stage} doctorId={doctor.id} navigate={navigate} />
                    </TableCell>
                    <TableCell>
                      {doctor.nextMeeting
                        ? format(new Date(doctor.nextMeeting), 'MMM d, yyyy')
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clinical/doctors/${doctor.id}`);
                          }}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteDoctorDialog 
        open={inviteOpen} 
        onOpenChange={setInviteOpen} 
        onSuccess={() => refetch()}
      />
    </div>
  );
}

function InlineAction({ stage, doctorId, navigate }: { stage: string; doctorId: string; navigate: (path: string) => void }) {
  const goToDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/clinical/doctors/${doctorId}`);
  };

  if (['baseline_submitted', 'ready_for_prep', 'prep_complete'].includes(stage)) {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Build Prep <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'scheduling_invite_sent') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        View Details <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'meeting_ready') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Start Meeting <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'meeting_pending') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Schedule Next <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'doctor_confirmed' || stage === 'followup_completed') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Start Follow-up <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
