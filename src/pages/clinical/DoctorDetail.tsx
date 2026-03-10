import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, ChevronDown, FlaskConical, TrendingUp } from 'lucide-react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';
import { DoctorNextActionPanel } from '@/components/clinical/DoctorNextActionPanel';
import { DoctorDetailOverview } from '@/components/clinical/DoctorDetailOverview';
import { DoctorDetailBaseline } from '@/components/clinical/DoctorDetailBaseline';
import { DoctorDetailThread } from '@/components/clinical/DoctorDetailThread';
import { CoachBaselineWizard } from '@/components/clinical/CoachBaselineWizard';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function DoctorDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const { data: myStaff } = useStaffProfile();
  const [showCoachWizard, setShowCoachWizard] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ['doctor-detail', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`id, name, email, created_at, baseline_released_at, locations (name)`)
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
    queryKey: ['coach-baseline-assessment', staffId, myStaff?.id],
    queryFn: async () => {
      if (!myStaff?.id || !staffId) return null;
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status, updated_at, completed_at')
        .eq('doctor_staff_id', staffId)
        .eq('coach_staff_id', myStaff.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staffId && !!myStaff?.id,
  });

  const { data: sessions } = useQuery({
    queryKey: ['coaching-sessions', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at, meeting_link')
        .eq('doctor_staff_id', staffId)
        .order('sequence_number', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const isLoading = doctorLoading || baselineLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clinical">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{doctor.name}</h1>
            <DoctorJourneyStatusPill status={journeyStatus} />
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {(doctor.locations as any)?.name || 'Roaming'}
          </p>
        </div>
      </div>

      {/* Next Action — always visible */}
      <DoctorNextActionPanel status={journeyStatus} />

      {/* Overview Actions (release baseline, build prep, invite, etc.) */}
      <DoctorDetailOverview
        doctor={doctor}
        baseline={baseline}
        sessions={sessions || []}
        journeyStatus={journeyStatus}
      />

      {/* Coaching Thread — inline */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          Coaching Thread
        </h2>
        <DoctorDetailThread sessions={sessions || []} coachName={myStaff?.name} doctorName={doctor.name} />
      </div>

      {/* Baseline — collapsible section */}
      <Collapsible open={baselineOpen} onOpenChange={setBaselineOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-3 w-full py-3 px-1 text-left hover:bg-muted/30 rounded-md transition-colors">
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", baselineOpen && "rotate-180")} />
            <h2 className="text-lg font-semibold">Baseline Assessment</h2>
            {baseline?.status === 'completed' && (
              <Badge variant="secondary" className="ml-auto text-xs">Complete</Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DoctorDetailBaseline
            staffId={staffId!}
            baseline={baseline}
            coachAssessment={coachAssessment}
            onStartCoachWizard={() => setShowCoachWizard(true)}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Coach Baseline Wizard — Sheet instead of full-page replacement */}
      <Sheet open={showCoachWizard} onOpenChange={setShowCoachWizard}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <div className="p-6">
            {staffId && doctor && (
              <CoachBaselineWizard
                doctorStaffId={staffId}
                doctorName={doctor.name}
                onBack={() => setShowCoachWizard(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
