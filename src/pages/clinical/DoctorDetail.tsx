import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';
import { DoctorNextActionPanel } from '@/components/clinical/DoctorNextActionPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DoctorDetailOverview } from '@/components/clinical/DoctorDetailOverview';
import { DoctorDetailBaseline } from '@/components/clinical/DoctorDetailBaseline';
import { DoctorDetailThread } from '@/components/clinical/DoctorDetailThread';
import { CoachBaselineWizard } from '@/components/clinical/CoachBaselineWizard';

export default function DoctorDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const { data: myStaff } = useStaffProfile();
  const [showCoachWizard, setShowCoachWizard] = useState(false);

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ['doctor-detail', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`id, name, email, created_at, locations (name)`)
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

  if (showCoachWizard && staffId && doctor) {
    return (
      <CoachBaselineWizard
        doctorStaffId={staffId}
        doctorName={doctor.name}
        onBack={() => setShowCoachWizard(false)}
      />
    );
  }

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
        <Link to="/clinical/doctors">
          <Button variant="link">Back to Doctor Management</Button>
        </Link>
      </div>
    );
  }

  const journeyStatus = getDoctorJourneyStatus(
    baseline ? { status: baseline.status, completed_at: baseline.completed_at } : null,
    coachAssessment ? { status: coachAssessment.status } : null,
    sessions || [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clinical/doctors">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{doctor.name}</h1>
            <DoctorJourneyStatusPill status={journeyStatus} />
          </div>
          <p className="text-muted-foreground">{doctor.email}</p>
        </div>
      </div>

      <DoctorNextActionPanel status={journeyStatus} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="baseline">Baseline</TabsTrigger>
          <TabsTrigger value="thread">Coaching Thread</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DoctorDetailOverview
            doctor={doctor}
            baseline={baseline}
            sessions={sessions || []}
            journeyStatus={journeyStatus}
          />
        </TabsContent>

        <TabsContent value="baseline">
          <DoctorDetailBaseline
            staffId={staffId!}
            baseline={baseline}
            coachAssessment={coachAssessment}
            onStartCoachWizard={() => setShowCoachWizard(true)}
          />
        </TabsContent>

        <TabsContent value="thread">
          <DoctorDetailThread sessions={sessions || []} coachName={myStaff?.name} doctorName={doctor.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
