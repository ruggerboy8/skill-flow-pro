import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DomainBadge } from '@/components/ui/domain-badge';
import { Target } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  doctorStaffId: string;
}

/**
 * The agreed next steps from the most recent coaching conversation,
 * surfaced on the coach's doctor page the same way the doctor already
 * sees them on their home screen. Action steps are the single unit of
 * coaching here (decided 2026-08-11: no separate focus-item lexicon);
 * each may carry an optional Pro Move link (action_id in the experiments
 * jsonb) captured at meeting write-up.
 */
export function ActionStepsCard({ doctorStaffId }: Props) {
  const { data: latest } = useQuery({
    queryKey: ['doctor-current-action-steps', doctorStaffId],
    queryFn: async () => {
      const { data: sessions, error: sessErr } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status')
        .eq('doctor_staff_id', doctorStaffId)
        .in('status', ['meeting_pending', 'doctor_confirmed'])
        .order('sequence_number', { ascending: false })
        .limit(1);
      if (sessErr) throw sessErr;
      const session = sessions?.[0];
      if (!session) return null;

      const { data: record, error: recErr } = await supabase
        .from('coaching_meeting_records')
        .select('experiments, submitted_at')
        .eq('session_id', session.id)
        .maybeSingle();
      if (recErr) throw recErr;
      if (!record) return null;

      const steps = ((record.experiments as any[] | null) || []).filter(s => s?.title);
      if (steps.length === 0) return null;

      // Resolve Pro Move statements and domains for any tagged steps
      const taggedIds = steps.map(s => s.action_id).filter((id): id is number => typeof id === 'number');
      let moveMap = new Map<number, { statement: string; domain: string }>();
      if (taggedIds.length > 0) {
        const { data: moves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement, competencies!fk_pro_moves_competency_id(domains!fk_competencies_domain_id(domain_name))')
          .in('action_id', taggedIds);
        moveMap = new Map((moves || []).map(m => [m.action_id, {
          statement: m.action_statement,
          domain: (m.competencies as any)?.domains?.domain_name || '',
        }]));
      }

      return {
        sessionLabel: session.session_type === 'baseline_review' ? 'Baseline Review' : `Check-in ${session.sequence_number - 1}`,
        submittedAt: record.submitted_at,
        steps: steps.map(s => ({
          ...s,
          proMove: s.action_id ? moveMap.get(s.action_id) : undefined,
        })),
      };
    },
    enabled: !!doctorStaffId,
  });

  if (!latest) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Current Action Steps</CardTitle>
        </div>
        <CardDescription>
          Agreed at the {latest.sessionLabel}
          {latest.submittedAt ? ` on ${format(new Date(latest.submittedAt), 'MMMM d')}` : ''}. The doctor sees these on their home screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {latest.steps.map((step: any, i: number) => (
          <div key={i} className="p-3 rounded-md border bg-muted/20 space-y-1">
            <p className="text-sm font-medium">{step.title}</p>
            {step.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{step.description}</p>
            )}
            {step.proMove && (
              <div className="flex items-start gap-2 mt-1">
                <DomainBadge domain={step.proMove.domain} className="mt-0.5" />
                <span className="text-xs text-muted-foreground">{step.proMove.statement}</span>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
