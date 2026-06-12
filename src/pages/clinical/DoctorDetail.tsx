import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MapPin, ChevronDown } from 'lucide-react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';
import { drName } from '@/lib/doctorDisplayName';

import { DoctorDetailOverview } from '@/components/clinical/DoctorDetailOverview';
import { DoctorLocationEditor } from '@/components/clinical/DoctorLocationEditor';
import { DoctorDetailBaseline } from '@/components/clinical/DoctorDetailBaseline';
import { DoctorDetailThread } from '@/components/clinical/DoctorDetailThread';
import { CoachBaselineWizard } from '@/components/clinical/CoachBaselineWizard';
import { ClinicalBaselineResults } from '@/components/clinical/ClinicalBaselineResults';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function DoctorDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const { data: myStaff } = useStaffProfile();
  const [showCoachWizard, setShowCoachWizard] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [privateBaselineOpen, setPrivateBaselineOpen] = useState(false);

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ['doctor-detail', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`id, name, email, created_at, baseline_released_at, primary_location_id, locations (id, name)`)
        .eq('id', staffId)
        .eq('is_doctor', true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const { data: baseline, isLoading: baselineLoading } = useQuery({
    queryKey: ['doctor-baseline', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, started_at, completed_at')
        .eq('doctor_staff_id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const { data: coachAssessment } = useQuery({
    queryKey: ['coach-baseline-assessment', staffId],
    queryFn: async () => {
      if (!staffId) return null;
      // Fetch ANY coach assessment for this doctor (first-to-start owns it)
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status, updated_at, completed_at, coach_staff_id')
        .eq('doctor_staff_id', staffId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const { data: sessions } = useQuery({
    queryKey: ['coaching-sessions', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at, meeting_link, coach_staff_id, coach:staff!coaching_sessions_coach_staff_id_fkey(name)')
        .eq('doctor_staff_id', staffId)
        .order('sequence_number', { ascending: false });
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        coach_name: s.coach?.name || 'Unknown Coach',
      }));
    },
    enabled: !!staffId,
  });

  const isLoading = doctorLoading || baselineLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Doctor not found</p>
        <Link to="/clinical">
          <Button variant="link">Back to Doctor Management</Button>
        </Link>
      </div>
    );
  }

  const journeyStatus = getDoctorJourneyStatus(
    baseline ? { status: baseline.status, completed_at: baseline.completed_at } : null,
    coachAssessment ? { status: coachAssessment.status } : null,
    sessions || [],
    (doctor as any)?.baseline_released_at,
  );

  // Full-page coach baseline wizard (replaces detail view)
  if (showCoachWizard && staffId && doctor) {
    return (
      <CoachBaselineWizard
        doctorStaffId={staffId}
        doctorName={drName(doctor.name)}
        onBack={() => setShowCoachWizard(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — name + single journey pill + one next-action line */}
      <div className="flex items-center gap-4">
        <Link to="/clinical">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{drName(doctor.name)}</h1>
            <DoctorJourneyStatusPill status={journeyStatus} />
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span>{(doctor.locations as any)?.name || 'Roaming'}</span>
            <DoctorLocationEditor
              doctorStaffId={staffId!}
              currentLocationId={(doctor as any).primary_location_id ?? null}
              currentLocationName={(doctor.locations as any)?.name ?? null}
            />
          </p>
          {journeyStatus.nextAction && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">Next:</span> {journeyStatus.nextAction}
            </p>
          )}
        </div>
      </div>

      {/* Pre-session actions (release baseline) — only while still invited */}
      <DoctorDetailOverview
        doctor={doctor}
        baseline={baseline}
        sessions={sessions || []}
        journeyStatus={journeyStatus}
      />

      {/* Doctor's baseline results — promoted above the thread since this is
          the primary reference the CD reads while prepping. */}
      <Collapsible open={resultsOpen} onOpenChange={setResultsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-3 w-full py-3 px-1 text-left hover:bg-muted/30 rounded-md transition-colors">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", resultsOpen && "rotate-180")} />
            <h2 className="text-lg font-semibold">Doctor's baseline results</h2>
            {baseline?.status === 'completed' && (
              <Badge variant="secondary" className="ml-auto text-xs">Complete</Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <ClinicalBaselineResults
            staffId={staffId!}
            assessmentId={baseline?.id}
            status={baseline?.status}
            completedAt={baseline?.completed_at}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Coaching Thread — the action hub */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Coaching Thread</h2>
        <DoctorDetailThread
          sessions={sessions || []}
          coachName={myStaff?.name}
          doctorName={drName(doctor.name)}
          doctorStaffId={staffId!}
          doctorEmail={doctor.email}
          doctorBaselineComplete={baseline?.status === 'completed'}
          coachAssessment={coachAssessment}
          onStartCoachWizard={() => setShowCoachWizard(true)}
        />
      </div>

      {/* Private baseline — single entry point */}
      <Collapsible open={privateBaselineOpen} onOpenChange={setPrivateBaselineOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-3 w-full py-3 px-1 text-left hover:bg-muted/30 rounded-md transition-colors">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", privateBaselineOpen && "rotate-180")} />
            <h2 className="text-lg font-semibold">Private baseline (your view)</h2>
            {coachAssessment?.status === 'completed' && (
              <Badge variant="secondary" className="ml-auto text-xs">Complete</Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DoctorDetailBaseline
            coachAssessment={coachAssessment}
            onStartCoachWizard={() => setShowCoachWizard(true)}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
