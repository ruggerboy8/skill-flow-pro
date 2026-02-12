import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, ArrowLeft, Mail, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
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
        .select(`id, name, email, created_at, locations (name)`)
        .eq('is_doctor', true)
        .order('name');
      
      if (staffErr) throw staffErr;
      
      const doctorIds = staffData?.map(d => d.id) || [];
      if (doctorIds.length === 0) return [];
      
      // Fetch baselines, coach baselines, and sessions in parallel
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
      
      // Group sessions by doctor
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
        );

        // Find next upcoming meeting
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

  const filteredDoctors = doctors?.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'needs_my_action') {
      return ['director_baseline_pending', 'baseline_submitted', 'baseline_review_scheduled', 'prep_complete', 'doctor_confirmed', 'followup_completed'].includes(d.journeyStatus.stage);
    }
    if (filter === 'waiting_on_doctor') {
      return ['invited', 'baseline_in_progress', 'waiting_for_doctor_prep', 'meeting_pending'].includes(d.journeyStatus.stage);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/clinical">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Doctor Management</h1>
          <p className="text-muted-foreground">Invite and manage doctors in the program</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Doctor
        </Button>
      </div>

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
