import { Separator } from '@/components/ui/separator';
import { DomainBadge } from '@/components/ui/domain-badge';
import { Link as LinkIcon } from 'lucide-react';
import DOMPurify from 'dompurify';

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
    <div className="space-y-6 pt-4">
      {/* Meeting Link */}
      {session.meeting_link && (
        <a
          href={session.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary underline"
        >
          <LinkIcon className="h-4 w-4" />
          Join Meeting
        </a>
      )}

      {/* Your Agenda */}
      {session.coach_note && (
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Agenda</h4>
          <div
            className="text-sm bg-muted/30 rounded-lg p-4 prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(session.coach_note) }}
          />
        </section>
      )}

      <Separator />

      {/* Your Pro Move Picks */}
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Picks</h4>
        {coachSelections.length > 0 ? (
          <div className="space-y-2">
            {coachSelections.map(sel => (
              <ProMoveItem key={sel.action_id} sel={sel} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No picks selected.</p>
        )}
      </section>

      <Separator />

      {/* Doctor's Pro Move Picks */}
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{doctorName}'s Picks</h4>
        {doctorSelections.length > 0 ? (
          <div className="space-y-2">
            {doctorSelections.map(sel => (
              <ProMoveItem key={sel.action_id} sel={sel} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Waiting for {doctorName} to submit picks.</p>
        )}
      </section>

      <Separator />

      {/* Doctor's Notes */}
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{doctorName}'s Notes & Questions</h4>
        {session.doctor_note ? (
          <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4">
            {session.doctor_note}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No notes submitted yet.</p>
        )}
      </section>
    </div>
  );
}

function ProMoveItem({ sel }: { sel: Selection }) {
  const domain = (sel.pro_moves as any)?.competencies?.domains?.domain_name;
  const statement = (sel.pro_moves as any)?.action_statement || `Action #${sel.action_id}`;

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/40">
      <DomainBadge domain={domain} className="mt-0.5" />
      <span className="text-sm">{statement}</span>
    </div>
  );
}
