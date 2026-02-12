import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { MessageSquare, ClipboardEdit } from 'lucide-react';
import { MeetingOutcomeCapture } from '@/components/clinical/MeetingOutcomeCapture';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  director_prep_ready: { label: 'Prep Sent', className: 'bg-amber-100 text-amber-800' },
  doctor_prep_submitted: { label: 'Prep Complete', className: 'bg-emerald-100 text-emerald-800' },
  meeting_pending: { label: 'Awaiting Confirmation', className: 'bg-purple-100 text-purple-800' },
  doctor_confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  doctor_revision_requested: { label: 'Revision Requested', className: 'bg-red-100 text-red-800' },
};

interface Props {
  sessions: Session[];
}

export function DoctorDetailThread({ sessions }: Props) {
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);

  if (captureSessionId) {
    return (
      <MeetingOutcomeCapture
        sessionId={captureSessionId}
        onBack={() => setCaptureSessionId(null)}
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No coaching sessions yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule a baseline review from the Overview tab to begin the coaching thread.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...sessions].sort((a, b) => a.sequence_number - b.sequence_number);

  // Sessions ready for outcome capture (prep complete or revision requested)
  const canCapture = (status: string) => ['doctor_prep_submitted', 'doctor_revision_requested'].includes(status);

  return (
    <div className="space-y-3">
      {sorted.map((session) => {
        const statusInfo = statusLabels[session.status] || { label: session.status, className: 'bg-muted text-muted-foreground' };
        const typeLabel = session.session_type === 'baseline_review'
          ? 'Baseline Review'
          : `Follow-up ${session.sequence_number - 1}`;

        return (
          <Card key={session.id} className="hover:bg-muted/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4">
              <div>
                <CardTitle className="text-base">{typeLabel}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(session.scheduled_at), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canCapture(session.status) && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCaptureSessionId(session.id)}>
                    <ClipboardEdit className="h-3.5 w-3.5" />
                    Capture Outcome
                  </Button>
                )}
                <Badge className={`${statusInfo.className} hover:${statusInfo.className}`}>
                  {statusInfo.label}
                </Badge>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
