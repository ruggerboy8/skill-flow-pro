import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Calendar, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';
import { type DoctorJourneyStatus } from '@/lib/doctorStatus';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string;
  meeting_link?: string | null;
}

interface Props {
  doctor: { id: string; name: string; email: string; created_at: string | null; locations: any };
  baseline: { id: string; status: string | null; started_at: string | null; completed_at: string | null } | null;
  sessions: Session[];
  journeyStatus: DoctorJourneyStatus;
}

export function DoctorDetailOverview({ doctor, baseline, sessions }: Props) {
  const upcomingSession = sessions
    .filter(s => ['scheduled', 'director_prep_ready', 'doctor_prep_submitted'].includes(s.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  return (
    <div className="space-y-4">
      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{doctor.locations?.name || 'Roaming'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invited</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {doctor.created_at ? format(new Date(doctor.created_at), 'MMM d, yyyy') : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Baseline</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {baseline?.completed_at
                ? format(new Date(baseline.completed_at), 'MMM d, yyyy')
                : baseline?.started_at ? 'In Progress' : 'Not Started'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Meeting */}
      {upcomingSession && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-medium">
                {upcomingSession.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${upcomingSession.sequence_number - 1}`}
              </span>
              {' — '}
              {format(new Date(upcomingSession.scheduled_at), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
            </p>
            {upcomingSession.meeting_link && (
              <a href={upcomingSession.meeting_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-1 inline-block">
                Join Meeting
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
