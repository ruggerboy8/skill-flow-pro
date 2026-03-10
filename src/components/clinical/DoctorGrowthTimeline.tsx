import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { DomainBadge } from '@/components/ui/domain-badge';
import { format } from 'date-fns';
import { CheckCircle2, Clock, XCircle, Circle } from 'lucide-react';

interface Props {
  doctorStaffId: string;
}

const ACTION_STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  addressed: { icon: CheckCircle2, color: 'text-emerald-600', label: 'Addressed' },
  continuing: { icon: Clock, color: 'text-amber-600', label: 'Continuing' },
  dropped: { icon: XCircle, color: 'text-muted-foreground', label: 'Dropped' },
};

const SESSION_STATUS_CONFIG: Record<string, { className: string; label: string }> = {
  doctor_confirmed: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Confirmed' },
  meeting_pending: { className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', label: 'Awaiting Confirmation' },
  doctor_revision_requested: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', label: 'Revision Requested' },
  doctor_prep_submitted: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', label: 'Ready for Meeting' },
  scheduling_invite_sent: { className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400', label: 'Invite Sent' },
  director_prep_ready: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', label: 'Send Invite' },
  scheduled: { className: 'bg-muted text-muted-foreground', label: 'Draft' },
};

export function DoctorGrowthTimeline({ doctorStaffId }: Props) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['doctor-growth-timeline', doctorStaffId],
    queryFn: async () => {
      const { data: sessions, error: sessErr } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at')
        .eq('doctor_staff_id', doctorStaffId)
        .order('sequence_number', { ascending: true });
      if (sessErr) throw sessErr;
      if (!sessions?.length) return [];

      const sessionIds = sessions.map(s => s.id);

      const [selectionsRes, recordsRes] = await Promise.all([
        supabase
          .from('coaching_session_selections')
          .select(`
            session_id, action_id, selected_by,
            pro_moves:action_id (
              action_statement,
              competencies!fk_pro_moves_competency_id (
                name,
                domains!competencies_domain_id_fkey (domain_name)
              )
            )
          `)
          .in('session_id', sessionIds),
        supabase
          .from('coaching_meeting_records')
          .select('session_id, experiments, prior_action_status, summary')
          .in('session_id', sessionIds),
      ]);

      const selectionsMap = new Map<string, any[]>();
      for (const sel of selectionsRes.data || []) {
        if (!selectionsMap.has(sel.session_id)) selectionsMap.set(sel.session_id, []);
        selectionsMap.get(sel.session_id)!.push(sel);
      }

      const recordsMap = new Map<string, any>();
      for (const rec of recordsRes.data || []) {
        recordsMap.set(rec.session_id, rec);
      }

      return sessions.map(s => ({
        ...s,
        selections: selectionsMap.get(s.id) || [],
        record: recordsMap.get(s.id) || null,
      }));
    },
    enabled: !!doctorStaffId,
  });

  if (isLoading) {
    return <div className="animate-pulse h-24 bg-muted/30 rounded-lg" />;
  }

  if (!timeline?.length) {
    return <p className="text-sm text-muted-foreground italic">No coaching sessions yet.</p>;
  }

  // Domain coverage summary
  const domainCounts: Record<string, number> = {};
  for (const entry of timeline) {
    for (const sel of entry.selections) {
      const domain = (sel.pro_moves as any)?.competencies?.domains?.domain_name;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  }

  return (
    <div className="space-y-4">
      {/* Domain Coverage */}
      {Object.keys(domainCounts).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(domainCounts).map(([domain, count]) => (
            <div key={domain} className="flex items-center gap-1.5">
              <DomainBadge domain={domain} />
              <span className="text-xs text-muted-foreground">{count} session{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="relative pl-6 space-y-0">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        {timeline.map((entry, i) => {
          const experiments = (entry.record?.experiments as any[]) || [];
          const priorStatuses = (entry.record?.prior_action_status as any[]) || [];
          const typeLabel = entry.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up #${entry.sequence_number}`;
          const statusClass = SESSION_STATUS_COLORS[entry.status] || SESSION_STATUS_COLORS.scheduled;

          return (
            <div key={entry.id} className="relative pb-6 last:pb-0">
              {/* Node dot */}
              <div className="absolute -left-6 top-1 w-[22px] h-[22px] rounded-full border-2 border-background bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">{entry.sequence_number}</span>
              </div>

              <div className="space-y-2">
                {/* Header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{typeLabel}</span>
                  <Badge className={`text-[10px] ${statusClass}`}>
                    {entry.status.replace(/_/g, ' ')}
                  </Badge>
                  {entry.scheduled_at && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(entry.scheduled_at), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>

                {/* Selected Pro Moves */}
                {entry.selections.length > 0 && (
                  <div className="space-y-1">
                    {entry.selections.map((sel: any) => {
                      const pm = sel.pro_moves as any;
                      return (
                        <div key={`${sel.action_id}-${sel.selected_by}`} className="flex items-center gap-2 text-xs">
                          <DomainBadge domain={pm?.competencies?.domains?.domain_name} className="scale-90" />
                          <span className="text-muted-foreground">{pm?.action_statement || `Action #${sel.action_id}`}</span>
                          <Badge variant="outline" className="text-[9px] px-1">{sel.selected_by}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action Steps */}
                {experiments.length > 0 && (
                  <div className="pl-2 border-l-2 border-primary/20 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action Steps</p>
                    {experiments.map((exp: any, j: number) => (
                      <p key={j} className="text-xs text-foreground">• {exp.title}</p>
                    ))}
                  </div>
                )}

                {/* Prior Action Statuses */}
                {priorStatuses.length > 0 && (
                  <div className="pl-2 border-l-2 border-amber-300/40 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prior Steps Review</p>
                    {priorStatuses.map((ps: any, j: number) => {
                      const config = ACTION_STATUS_ICONS[ps.status] || ACTION_STATUS_ICONS.continuing;
                      const Icon = config.icon;
                      return (
                        <div key={j} className="flex items-center gap-1.5 text-xs">
                          <Icon className={`h-3 w-3 ${config.color}`} />
                          <span>{ps.title || `Step ${j + 1}`}</span>
                          <span className="text-muted-foreground">— {config.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
