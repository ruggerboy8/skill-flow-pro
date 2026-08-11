import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, FlaskConical, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function DoctorCoachingHistory() {
  const { data: staff } = useStaffProfile();

  const { data: sessions } = useQuery({
    queryKey: ['my-coaching-sessions', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return [];
      // Select list must match DoctorHome's — both share the
      // ['my-coaching-sessions', staffId] cache key, and whichever runs
      // first serves the other, so differing column sets would leave one
      // consumer reading fields the cached shape doesn't have.
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at, meeting_link, coach_note')
        .eq('doctor_staff_id', staff.id)
        .order('sequence_number', { ascending: false });
      // status is carried through to CompletedSessionCard so it can tell
      // "summary ready, not yet confirmed" apart from "confirmed".
      if (error) throw error;
      return data || [];
    },
    enabled: !!staff?.id,
  });

  const completedSessions = sessions?.filter(s => s.status === 'doctor_confirmed' || s.status === 'meeting_pending')
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

function CompletedSessionCard({ session }: { session: { id: string; session_type: string; sequence_number: number; scheduled_at: string | null; status: string } }) {
  const [open, setOpen] = useState(false);
  const isConfirmed = session.status === 'doctor_confirmed';

  const { data: meetingRecord } = useQuery({
    // Distinct from the coach-side ['meeting-record'] key: this one holds a
    // narrowed row (no raw_transcript), the coach side selects *.
    queryKey: ['meeting-record-doctor', session.id],
    queryFn: async () => {
      // Deliberately not select('*'): raw_transcript lives on this row and
      // is coach-side material — keep it off the doctor's client.
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('session_id, summary, experiments, doctor_confirmed_at')
        .eq('session_id', session.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const actionSteps = (meetingRecord?.experiments as any[] | null) || [];
  // "Check-in N", not "Follow-up N" — matches the coach side's naming
  // (DoctorDetailThread) so both parties talk about the same session by the
  // same name.
  const typeLabel = session.session_type === 'baseline_review' ? 'Baseline Review' : `Check-in ${session.sequence_number - 1}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="transition-colors">
        <CollapsibleTrigger asChild>
          <CardContent className="flex items-center justify-between py-4 cursor-pointer hover:bg-muted/30">
            <div className="flex items-center gap-3">
              {isConfirmed ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Clock className="h-5 w-5 shrink-0" style={{ color: 'hsl(var(--status-pending))' }} />
              )}
              <div>
                <p className="text-sm font-medium">{typeLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {session.scheduled_at ? format(new Date(session.scheduled_at), 'MMMM d, yyyy') : 'Date not set'}
                </p>
                {!isConfirmed && (
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'hsl(var(--status-pending))' }}>
                    Summary ready to review
                  </p>
                )}
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
            {/* "View Full Record" only makes sense for meeting_pending: that
                route (review-prep) is where MeetingConfirmationCard lives and
                the doctor still has an action to take (confirm). For an
                already-confirmed session this card's own expand already
                shows the summary and action steps in full — the prep-view
                route actually shows LESS for a confirmed session (it has no
                confirmed-session branch of its own), so linking to it there
                would be a downgrade, not a detail view. */}
            {!isConfirmed && (
              <Link to={`/doctor/review-prep/${session.id}`}>
                <Button variant="ghost" size="sm" className="w-full">View Full Record</Button>
              </Link>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
