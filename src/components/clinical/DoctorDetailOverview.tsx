import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { type DoctorJourneyStatus } from '@/lib/doctorStatus';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string | null;
  meeting_link?: string | null;
}

interface Props {
  doctor: { id: string; name: string; email: string; created_at: string | null; locations: any };
  baseline: { id: string; status: string | null; started_at: string | null; completed_at: string | null } | null;
  sessions: Session[];
  journeyStatus: DoctorJourneyStatus;
}

export function DoctorDetailOverview({ doctor, baseline, sessions, journeyStatus }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: myStaff } = useStaffProfile();

  const isNotReleased = journeyStatus.stage === 'invited';

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!myStaff?.id) throw new Error('Staff profile not loaded');

      // Release baseline
      const { error } = await supabase
        .from('staff')
        .update({ baseline_released_at: new Date().toISOString(), baseline_released_by: user.id } as any)
        .eq('id', doctor.id);
      if (error) throw error;

      // Auto-create baseline_review session in the coaching thread
      const { error: sessionErr } = await supabase
        .from('coaching_sessions')
        .insert({
          doctor_staff_id: doctor.id,
          coach_staff_id: myStaff.id,
          session_type: 'baseline_review',
          sequence_number: 1,
          status: 'scheduled',
        });
      if (sessionErr) console.error('Failed to auto-create baseline review session:', sessionErr);

      // Send release email
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.functions.invoke('coach-remind', {
            body: {
              template_key: 'baseline_release',
              subject: 'Your baseline self-assessment is ready',
              body: `Hi {{first_name}},\n\nYour clinical director has opened your baseline self-assessment. Log in to your portal to begin — it takes about 15–20 minutes.\n\nThis is the first step in your professional development journey. Your responses are private and will help guide your coaching conversations.\n\nBest,\n{{coach_name}}`,
              recipients: [{
                user_id: doctor.id,
                email: doctor.email,
                name: doctor.name,
              }],
            },
          });
        }
      } catch (emailErr) {
        console.warn('Failed to send baseline release email:', emailErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-detail'] });
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Baseline released', description: `${doctor.name} can now start their self-assessment. A baseline review session has been added to the coaching thread.` });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (!isNotReleased) return null;

  return (
    <div className="space-y-4">
      {/* Release Baseline Button */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium">Ready to release baseline?</p>
            <p className="text-xs text-muted-foreground">
              This will allow {doctor.name} to begin their self-assessment.
            </p>
          </div>
          <Button
            onClick={() => releaseMutation.mutate()}
            disabled={releaseMutation.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {releaseMutation.isPending ? 'Releasing…' : 'Release Baseline'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
