import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, Link as LinkIcon, User } from 'lucide-react';
import { format } from 'date-fns';

interface Selection {
  action_id: number;
  selected_by: string;
  pro_moves?: {
    action_statement?: string;
    competencies?: {
      name?: string;
      domains?: { domain_name?: string };
    };
  };
}

interface Props {
  session: {
    scheduled_at: string;
    meeting_link?: string | null;
    coach_note: string;
    doctor_note?: string | null;
    status: string;
  };
  selections: Selection[];
  coachName?: string;
  doctorName?: string;
}

export function CombinedPrepView({ session, selections, coachName = 'Alex', doctorName = 'Doctor' }: Props) {
  const coachSelections = selections.filter(s => s.selected_by === 'coach');
  const doctorSelections = selections.filter(s => s.selected_by === 'doctor');

  return (
    <div className="space-y-6">
      {/* Meeting Details */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(new Date(session.scheduled_at), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}</span>
          </div>
          {session.meeting_link && (
            <a
              href={session.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary underline"
            >
              <LinkIcon className="h-4 w-4" />
              Join Meeting
            </a>
          )}
        </CardContent>
      </Card>

      {/* Coach Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{coachName}'s Prep</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {coachSelections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Discussion Topics</p>
              <div className="space-y-2">
                {coachSelections.map(sel => (
                  <div key={sel.action_id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Badge variant="outline" className="text-xs">
                      {(sel.pro_moves as any)?.competencies?.domains?.domain_name || '—'}
                    </Badge>
                    <span className="text-sm">{(sel.pro_moves as any)?.action_statement || `Action #${sel.action_id}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.coach_note && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
              <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                {session.coach_note}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doctor Section */}
      {(doctorSelections.length > 0 || session.doctor_note) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{doctorName}'s Prep</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {doctorSelections.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Discussion Topics</p>
                <div className="space-y-2">
                  {doctorSelections.map(sel => (
                    <div key={sel.action_id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      <Badge variant="outline" className="text-xs">
                        {(sel.pro_moves as any)?.competencies?.domains?.domain_name || '—'}
                      </Badge>
                      <span className="text-sm">{(sel.pro_moves as any)?.action_statement || `Action #${sel.action_id}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {session.doctor_note && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes & Questions</p>
                <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                  {session.doctor_note}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Waiting for the doctor to complete their prep.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
