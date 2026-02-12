import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function DoctorCoachingHistory() {
  const { data: staff } = useStaffProfile();

  const { data: sessions } = useQuery({
    queryKey: ['my-coaching-sessions', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return [];
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at')
        .eq('doctor_staff_id', staff.id)
        .order('sequence_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!staff?.id,
  });

  const completedSessions = sessions?.filter(s => s.status === 'doctor_confirmed')
    .sort((a, b) => b.sequence_number - a.sequence_number) || [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Coaching History</h1>

      {completedSessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No completed coaching sessions yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sessions will appear here after they've been confirmed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {completedSessions.map(session => (
            <CompletedSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedSessionCard({ session }: { session: { id: string; session_type: string; sequence_number: number; scheduled_at: string } }) {
  const [open, setOpen] = useState(false);

  const { data: meetingRecord } = useQuery({
    queryKey: ['meeting-record', session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('*')
        .eq('session_id', session.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const actionSteps = (meetingRecord?.experiments as any[] | null) || [];
  const typeLabel = session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${session.sequence_number - 1}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="transition-colors">
        <CollapsibleTrigger asChild>
          <CardContent className="flex items-center justify-between py-4 cursor-pointer hover:bg-muted/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{typeLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(session.scheduled_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {meetingRecord ? (
              <>
                {meetingRecord.summary && (
                  <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                    {meetingRecord.summary}
                  </div>
                )}
                {actionSteps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FlaskConical className="h-3.5 w-3.5" />
                      Action Steps
                    </p>
                    {actionSteps.map((exp: any, i: number) => (
                      <div key={i} className="p-2 rounded-md bg-muted/30 border mb-1.5">
                        <p className="text-sm font-medium">{exp.title}</p>
                        {exp.description && <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            <Link to={`/doctor/review-prep/${session.id}`}>
              <Button variant="ghost" size="sm" className="w-full">View Full Record</Button>
            </Link>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
