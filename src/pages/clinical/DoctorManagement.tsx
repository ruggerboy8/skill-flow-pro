import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Mail, MoreHorizontal, Users, ClipboardCheck, Clock, ArrowRight, BookOpen, UserCheck, UserMinus, Unlock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import { InviteDoctorDialog } from '@/components/clinical/InviteDoctorDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { drName } from '@/lib/doctorDisplayName';
import { useUserRole } from '@/hooks/useUserRole';
import { buildOrganizationStaffScopeFilter } from '@/lib/clinicalDoctorScope';
import { useDoctorMenteeIds } from '@/hooks/useDoctorMenteeIds';
import {
  filterDoctorsForRosterView,
  getEnrollmentConfirmCopy,
  canReleaseBaseline,
  getBaselineReleaseConfirmCopy,
  type RosterViewMode,
} from '@/lib/doctorCoachingEnrollment';


import { getDoctorJourneyStatus, type DoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';
import { CadenceIndicator } from '@/components/clinical/CadenceIndicator';

interface DoctorRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  location_name: string | null;
  created_at: string;
  journeyStatus: DoctorJourneyStatus;
  lastSessionAt: string | null;
  coaching_enrolled_at: string | null;
  baseline_released_at: string | null;
}

type FilterValue = 'all' | 'needs_my_action' | 'waiting_on_doctor';

export default function DoctorManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useUrlState<FilterValue>('status', 'all');
  const [viewMode, setViewMode] = useUrlState<RosterViewMode>('view', 'enrolled');
  const [enrollmentTarget, setEnrollmentTarget] = useState<{ id: string; name: string; action: 'enroll' | 'unenroll' } | null>(null);
  const [enrollmentSubmitting, setEnrollmentSubmitting] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<{ id: string; name: string } | null>(null);
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const navigate = useNavigate();
  const { organizationId, isSuperAdmin, isClinicalDirector, staffId } = useUserRole();

  // Assignments are read live (not from the cached staff profile) so removing a
  // coaching assignment takes effect for the coach without a full reload.
  const { data: liveMenteeIds = [], isLoading: menteesLoading } = useDoctorMenteeIds(staffId);
  const doctorMenteeIds = liveMenteeIds;

  // Doctor coaches (owner doctors with assigned learners) see ONLY their
  // assigned doctors; CDs and super admins keep the org-wide roster.
  const menteesOnly = doctorMenteeIds.length > 0 && !isClinicalDirector && !isSuperAdmin;

  const { data: doctors, isLoading: doctorsLoading, refetch } = useQuery({
    queryKey: ['doctors-management', organizationId, isSuperAdmin, menteesOnly, doctorMenteeIds.join(',')],

    refetchOnMount: 'always',

    staleTime: 0,
    queryFn: async (): Promise<DoctorRow[]> => {
      // Diagnostic logging: if a clinical director can't see an expected doctor,
      // they can copy this console output. Org resolution is the usual culprit —
      // a null organizationId yields an empty list (see the guard below).
      console.log('[ClinicalDoctors] resolving list — organizationId:', organizationId, '| isSuperAdmin:', isSuperAdmin, '| menteesOnly:', menteesOnly);

      let staffQuery = supabase
        .from('staff')
        .select(`id, user_id, name, email, created_at, baseline_released_at, locations (name)`)
        .eq('is_doctor', true)
        .order('name');

      if (menteesOnly) {
        if (doctorMenteeIds.length === 0) return [];
        staffQuery = staffQuery.in('id', doctorMenteeIds);
      } else if (organizationId) {
        const scopeFilter = await buildOrganizationStaffScopeFilter(organizationId);
        console.log('[ClinicalDoctors] staff scope filter:', scopeFilter);
        staffQuery = staffQuery.or(scopeFilter);
      } else if (!isSuperAdmin) {
        console.warn('[ClinicalDoctors] no organizationId and not a super admin → returning empty doctor list');
        return [];
      }

      const { data: staffData, error: staffErr } = await staffQuery;

      if (staffErr) {
        console.error('[ClinicalDoctors] staff query failed:', staffErr);
        throw staffErr;
      }

      console.log(
        `[ClinicalDoctors] fetched ${staffData?.length ?? 0} doctor(s):`,
        (staffData ?? []).map(d => ({ id: d.id, name: d.name })),
      );

      const doctorIds = staffData?.map(d => d.id) || [];
      if (doctorIds.length === 0) return [];
      
      const [baselinesRes, coachBaselinesRes, sessionsRes, enrollmentRes] = await Promise.all([
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
        // DR-1: coaching_enrolled_at/by are new additive columns; types.ts is
        // not regenerated per repo convention, so this row is hand-typed
        // below, mirroring how useAuth.tsx hand-types pwa_enabled.
        supabase
          .from('staff')
          .select('id, coaching_enrolled_at, coaching_enrolled_by' as 'id')
          .in('id', doctorIds),
      ]);

      if (baselinesRes.error) throw baselinesRes.error;
      if (coachBaselinesRes.error) throw coachBaselinesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (enrollmentRes.error) throw enrollmentRes.error;

      const baselineMap = new Map(baselinesRes.data?.map(b => [b.doctor_staff_id, b]) || []);
      const coachBaselineMap = new Map(coachBaselinesRes.data?.map(b => [b.doctor_staff_id, b]) || []);
      const enrollmentRows = (enrollmentRes.data ?? []) as unknown as
        { id: string; coaching_enrolled_at: string | null; coaching_enrolled_by: string | null }[];
      const enrollmentMap = new Map(enrollmentRows.map(r => [r.id, r.coaching_enrolled_at]));

      const sessionsMap = new Map<string, typeof sessionsRes.data>();
      for (const s of sessionsRes.data || []) {
        if (!sessionsMap.has(s.doctor_staff_id)) sessionsMap.set(s.doctor_staff_id, []);
        sessionsMap.get(s.doctor_staff_id)!.push(s);
      }

      // Cadence pulse: max meeting-record submitted_at per doctor, via
      // their sessions. Purely informational — no gate, just a nudge on
      // the roster when a pair has gone quiet.
      const allSessionIds = (sessionsRes.data || []).map(s => s.id);
      const sessionIdToDoctorId = new Map((sessionsRes.data || []).map(s => [s.id, s.doctor_staff_id]));
      const lastSessionMap = new Map<string, string>();
      if (allSessionIds.length > 0) {
        const { data: recordsData, error: recordsErr } = await supabase
          .from('coaching_meeting_records')
          .select('session_id, submitted_at')
          .in('session_id', allSessionIds)
          .not('submitted_at', 'is', null);
        if (recordsErr) throw recordsErr;
        for (const r of recordsData || []) {
          const doctorId = sessionIdToDoctorId.get(r.session_id);
          if (!doctorId || !r.submitted_at) continue;
          const existing = lastSessionMap.get(doctorId);
          if (!existing || new Date(r.submitted_at) > new Date(existing)) {
            lastSessionMap.set(doctorId, r.submitted_at);
          }
        }
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

        return {
          id: s.id,
          user_id: s.user_id,
          name: s.name,
          email: s.email,
          location_name: (s.locations as any)?.name || null,
          created_at: s.created_at || '',
          journeyStatus,
          lastSessionAt: lastSessionMap.get(s.id) || null,
          coaching_enrolled_at: enrollmentMap.get(s.id) ?? null,
          baseline_released_at: (s as any).baseline_released_at ?? null,
        };
      });
    },
    enabled: !!organizationId || isSuperAdmin,
  });

  // Keep the doctor list fresh without a hard reload — invalidate on any staff change.
  useEffect(() => {
    const channel = supabase
      .channel('doctors-management-staff')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff', filter: 'is_doctor=eq.true' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['doctors-management'] });
          queryClient.invalidateQueries({ queryKey: ['doctor-stats'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const isLoading = menteesLoading || doctorsLoading;

  // DR-1: the CD/super-admin org-wide roster defaults to enrolled doctors
  // only; menteesOnly coaches always see their full assigned list regardless
  // of view mode (see filterDoctorsForRosterView).
  const doctorsInView = doctors ? filterDoctorsForRosterView(doctors, viewMode, menteesOnly) : undefined;

  async function handleEnrollmentConfirm() {
    if (!enrollmentTarget) return;
    setEnrollmentSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'set_coaching_enrollment',
          staff_id: enrollmentTarget.id,
          enrolled: enrollmentTarget.action === 'enroll',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: enrollmentTarget.action === 'enroll' ? 'Enrolled' : 'Removed from coaching',
        description: enrollmentTarget.action === 'enroll'
          ? `${enrollmentTarget.name} is now on the coaching roster.`
          : `${enrollmentTarget.name} is no longer on the coaching roster.`,
      });
      await refetch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update coaching enrollment', variant: 'destructive' });
    } finally {
      setEnrollmentSubmitting(false);
      setEnrollmentTarget(null);
    }
  }

  async function handleReleaseConfirm() {
    if (!releaseTarget) return;
    setReleaseSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'release_baseline',
          staff_id: releaseTarget.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Baseline released',
        description: `${releaseTarget.name} can now start their self-assessment.`,
      });
      await refetch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to release baseline', variant: 'destructive' });
    } finally {
      setReleaseSubmitting(false);
      setReleaseTarget(null);
    }
  }

  // Compute stats from the currently viewed doctors

  const stats = doctorsInView ? {
    total: doctorsInView.length,
    completed: doctorsInView.filter(d => ['baseline_submitted', 'coach_baseline_pending', 'ready_for_prep', 'prep_complete', 'scheduling_invite_sent', 'meeting_ready', 'meeting_pending', 'doctor_confirmed', 'followup_scheduled', 'followup_completed'].includes(d.journeyStatus.stage)).length,
    inProgress: doctorsInView.filter(d => d.journeyStatus.stage === 'baseline_in_progress').length,
    invited: doctorsInView.filter(d => ['invited', 'baseline_released'].includes(d.journeyStatus.stage)).length,
  } : null;

  const filteredDoctors = doctorsInView?.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'needs_my_action') {
      return ['baseline_submitted', 'coach_baseline_pending', 'ready_for_prep', 'prep_complete', 'doctor_confirmed', 'followup_completed'].includes(d.journeyStatus.stage);
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
          {/* Mentees-only coaches (regional coaches without CD/super-admin
              scope) don't run the org's doctor pipeline — inviting doctors
              and sending platform invites belongs to the clinical
              directors. "Coaching Portal" better matches what they can
              actually do here. */}
          <h1 className="text-2xl font-bold">{menteesOnly ? 'Coaching Portal' : 'Clinical Director Portal'}</h1>
          <p className="text-muted-foreground">Manage doctor onboarding and development</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/clinical/pro-moves')}>
            <BookOpen className="w-4 h-4 mr-2" />
            Pro Moves Library
          </Button>
          {!menteesOnly && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Doctor
            </Button>
          )}
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
          <div>
            <CardTitle>{menteesOnly ? 'All Doctors' : viewMode === 'enrolled' ? 'Enrolled Doctors' : 'All Doctors'}</CardTitle>
            {filter !== 'all' && !isLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing {filteredDoctors?.length ?? 0} of {doctorsInView?.length ?? 0}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!menteesOnly && (
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as RosterViewMode)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enrolled">Enrolled</SelectItem>
                  <SelectItem value="all">All doctors</SelectItem>
                </SelectContent>
              </Select>
            )}
            {filter !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setFilter('all')}>
                Show all
              </Button>
            )}
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
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredDoctors?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {(doctorsInView?.length ?? 0) > 0 && filter !== 'all' ? (
                <>
                  <p>No doctors match this filter.</p>
                  <Button className="mt-4" variant="outline" onClick={() => setFilter('all')}>
                    Show all doctors
                  </Button>
                </>
              ) : menteesOnly ? (
                <p>No doctors are assigned to you yet.</p>
              ) : viewMode === 'enrolled' && (doctors?.length ?? 0) > 0 ? (
                <>
                  <p>No doctors are enrolled in coaching yet.</p>
                  <Button className="mt-4" variant="outline" onClick={() => setViewMode('all')}>
                    Show all doctors
                  </Button>
                </>
              ) : (
                <>
                  <p>No doctors found.</p>
                  <Button className="mt-4" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Your First Doctor
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Last Session</TableHead>
                  <TableHead>Action</TableHead>
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
                        <span className="font-medium">{drName(doctor.name)}</span>
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
                      <CadenceIndicator lastSessionAt={doctor.lastSessionAt} />
                    </TableCell>
                    <TableCell>
                      <InlineAction stage={doctor.journeyStatus.stage} doctorId={doctor.id} navigate={navigate} />
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
                          {/* Resend Invite re-sends the platform account invite,
                              a CD/admin action — a regional coach seeing it
                              would either fail (no permission) or confuse
                              "resend platform invite" with "invite to a
                              coaching session". */}
                          {!menteesOnly && (
                            <DropdownMenuItem onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const { data, error } = await supabase.functions.invoke('admin-users', {
                                  body: { action: 'resend_invite', user_id: doctor.user_id },
                                });
                                if (error) throw error;
                                if (data?.error) throw new Error(data.error);
                                toast({ title: 'Sent', description: `Invitation resent to ${doctor.email}` });
                              } catch (err: any) {
                                toast({ title: 'Error', description: err.message || 'Failed to resend invite', variant: 'destructive' });
                              }
                            }}>
                              <Mail className="h-4 w-4 mr-2" />
                              Resend Invite
                            </DropdownMenuItem>
                          )}
                          {/* Coaching enrollment is a CD/super-admin roster
                              decision (DR-1); gate on the actual privilege,
                              not on menteesOnly, so a coach whose mentee list
                              is empty never sees roster-management actions. */}
                          {(isClinicalDirector || isSuperAdmin) && (
                            doctor.coaching_enrolled_at == null ? (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                setEnrollmentTarget({ id: doctor.id, name: drName(doctor.name), action: 'enroll' });
                              }}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Enroll in coaching
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                setEnrollmentTarget({ id: doctor.id, name: drName(doctor.name), action: 'unenroll' });
                              }}>
                                <UserMinus className="h-4 w-4 mr-2" />
                                Remove from coaching
                              </DropdownMenuItem>
                            )
                          )}
                          {/* DR-2: baseline release is its own action, separate
                              from invite. Only offered for doctors who are
                              enrolled and not yet released; once released the
                              journey status pill already reflects it, so there
                              is nothing more to show here. */}
                          {(isClinicalDirector || isSuperAdmin) && canReleaseBaseline(doctor) && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setReleaseTarget({ id: doctor.id, name: drName(doctor.name) });
                            }}>
                              <Unlock className="h-4 w-4 mr-2" />
                              Release baseline
                            </DropdownMenuItem>
                          )}
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

      <AlertDialog open={enrollmentTarget !== null} onOpenChange={(open) => { if (!open) setEnrollmentTarget(null); }}>
        <AlertDialogContent>
          {enrollmentTarget && (() => {
            const copy = getEnrollmentConfirmCopy(enrollmentTarget.name, enrollmentTarget.action);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                  <AlertDialogDescription>{copy.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={enrollmentSubmitting} onClick={() => handleEnrollmentConfirm()}>
                    {copy.confirmLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={releaseTarget !== null} onOpenChange={(open) => { if (!open) setReleaseTarget(null); }}>
        <AlertDialogContent>
          {releaseTarget && (() => {
            const copy = getBaselineReleaseConfirmCopy(releaseTarget.name);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                  <AlertDialogDescription>{copy.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={releaseSubmitting} onClick={() => handleReleaseConfirm()}>
                    {copy.confirmLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InlineAction({ stage, doctorId, navigate }: { stage: string; doctorId: string; navigate: (path: string) => void }) {
  const goToDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/clinical/doctors/${doctorId}`);
  };

  if (['baseline_submitted', 'coach_baseline_pending'].includes(stage)) {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Complete coach baseline <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'ready_for_prep') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Build agenda <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'prep_complete') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Send to doctor <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'scheduling_invite_sent') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        View details <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'meeting_ready') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Log meeting <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'meeting_pending') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Schedule next <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  if (stage === 'doctor_confirmed' || stage === 'followup_completed') {
    return (
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={goToDetail}>
        Start follow-up <ArrowRight className="h-3 w-3" />
      </Button>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
