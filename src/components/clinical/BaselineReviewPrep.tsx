import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowUpDown, Flag } from 'lucide-react';
import { ReflectionSection } from '@/components/doctor/ReflectionSection';
import { getDomainColorRaw } from '@/lib/domainColors';
import { drName } from '@/lib/doctorDisplayName';

interface Props {
  doctorStaffId: string;
  doctorName: string;
  onBack: () => void;
  onOpenCoachBaseline?: () => void;
}

const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

interface Row {
  action_id: number;
  action_statement: string;
  competency_name: string;
  domain_name: string;
  self_score: number | null;
  self_note: string | null;
  observed_score: number | null;
}

/**
 * The one-time comparison of the doctor's self-baseline against the
 * coach's observed baseline. Meant as prep for the FIRST coaching
 * conversation (the baseline review session) — not a recurring view.
 * Its durable output is the set of Focus Moves the coach creates from it;
 * later sessions see a compact recap instead of this full comparison.
 * Coach-eyes-only: observed scores never render on any doctor-facing
 * surface.
 */
export function BaselineReviewPrep({ doctorStaffId, doctorName, onBack, onOpenCoachBaseline }: Props) {
  const { data: myStaff } = useStaffProfile();
  const firstName = drName(doctorName).replace(/^dr\.?\s*/i, '').trim().split(' ')[0] || doctorName;

  const { data: selfAssessment, isLoading: selfLoading } = useQuery({
    queryKey: ['baseline-review-prep-self', doctorStaffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, completed_at, flagged_domains, reflection_original, reflection_formatted')
        .eq('doctor_staff_id', doctorStaffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!doctorStaffId,
  });

  const { data: selfItems } = useQuery({
    queryKey: ['baseline-review-prep-self-items', selfAssessment?.id],
    queryFn: async () => {
      if (!selfAssessment?.id) return [];
      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select(`
          action_id, self_score, self_note,
          pro_moves!doctor_baseline_items_action_id_fkey (
            action_statement,
            competencies!fk_pro_moves_competency_id (
              name,
              domains!competencies_domain_id_fkey (domain_name)
            )
          )
        `)
        .eq('assessment_id', selfAssessment.id)
        .not('self_score', 'is', null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selfAssessment?.id,
  });

  // Own assessment first, falling back to the latest completed one from
  // any coach — same pattern DirectorPrepComposer uses.
  const { data: coachAssessmentId } = useQuery({
    queryKey: ['baseline-review-prep-coach-assessment-id', doctorStaffId, myStaff?.id],
    queryFn: async () => {
      if (myStaff?.id) {
        const { data: mine } = await supabase
          .from('coach_baseline_assessments')
          .select('id')
          .eq('doctor_staff_id', doctorStaffId)
          .eq('coach_staff_id', myStaff.id)
          .eq('status', 'completed')
          .maybeSingle();
        if (mine?.id) return mine.id;
      }
      const { data: latest } = await supabase
        .from('coach_baseline_assessments')
        .select('id')
        .eq('doctor_staff_id', doctorStaffId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return latest?.id ?? null;
    },
    enabled: !!doctorStaffId,
  });

  const { data: coachItems } = useQuery({
    queryKey: ['baseline-review-prep-coach-items', coachAssessmentId],
    queryFn: async () => {
      if (!coachAssessmentId) return [];
      const { data, error } = await supabase
        .from('coach_baseline_items')
        .select('action_id, rating')
        .eq('assessment_id', coachAssessmentId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!coachAssessmentId,
  });

  const coachRatingMap = useMemo(() => {
    const map = new Map<number, number>();
    (coachItems || []).forEach(i => { if (i.rating != null) map.set(i.action_id, i.rating); });
    return map;
  }, [coachItems]);

  const rows: Row[] = useMemo(() => {
    return (selfItems || []).map((item: any) => {
      const pm = item.pro_moves;
      return {
        action_id: item.action_id,
        action_statement: pm?.action_statement || `Action #${item.action_id}`,
        competency_name: pm?.competencies?.name || '',
        domain_name: pm?.competencies?.domains?.domain_name || 'Other',
        self_score: item.self_score,
        self_note: item.self_note,
        observed_score: coachRatingMap.get(item.action_id) ?? null,
      };
    });
  }, [selfItems, coachRatingMap]);

  const hasCoachData = coachRatingMap.size > 0;

  const rankedGaps = useMemo(() => {
    if (!hasCoachData) return [];
    return rows
      .filter(r => r.self_score != null && r.self_score > 0 && r.observed_score != null && r.observed_score > 0)
      .map(r => ({ ...r, gap: Math.abs((r.self_score as number) - (r.observed_score as number)) }))
      .filter(r => r.gap >= 1)
      .sort((a, b) => b.gap - a.gap);
  }, [rows, hasCoachData]);

  const groupedByDomain = useMemo(() => {
    const grouped: Record<string, Row[]> = {};
    rows.forEach(r => {
      if (!grouped[r.domain_name]) grouped[r.domain_name] = [];
      grouped[r.domain_name].push(r);
    });
    return grouped;
  }, [rows]);

  const orderedDomains = DOMAIN_ORDER.filter(d => groupedByDomain[d]?.length);
  const flaggedDomains: string[] = (selfAssessment?.flagged_domains as string[]) || [];

  if (selfLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!selfAssessment || selfAssessment.status !== 'completed') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {firstName} hasn't finished their self-assessment yet. Come back once it's complete.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
      </Button>

      <div>
        <h1 className="text-xl font-semibold">Baseline Review Prep</h1>
        <p className="text-sm text-muted-foreground mt-1">{firstName}'s self-read next to yours, ranked by where they differ most.</p>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="py-3">
          <p className="text-sm text-muted-foreground">
            In the conversation itself, name the Pro Move you want to talk about, not the number
            you gave it. The number invites debate. The behavior invites conversation.
          </p>
        </CardContent>
      </Card>

      {!hasCoachData && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-medium">Showing self-only for now</p>
            <p className="text-sm text-muted-foreground">
              Complete your own observed baseline to see where your read differs from {firstName}'s,
              and to get a ranked list of the biggest gaps.
            </p>
            {onOpenCoachBaseline && (
              <Button size="sm" onClick={onOpenCoachBaseline}>Open baseline</Button>
            )}
          </CardContent>
        </Card>
      )}

      {hasCoachData && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Biggest gaps</CardTitle>
            </div>
            <CardDescription>Largest difference between self and observed first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rankedGaps.length === 0 && (
              <p className="text-sm text-muted-foreground">No meaningful gaps. Your reads line up closely.</p>
            )}
            {rankedGaps.map(r => {
              const doctorHigher = (r.self_score as number) > (r.observed_score as number);
              return (
                <div key={r.action_id} className="p-3 rounded-md border bg-background space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.action_statement}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doctorHigher
                          ? `${firstName} sees this stronger than you do.`
                          : `You see this stronger than ${firstName} does.`}
                        {' '}Self {r.self_score} · You {r.observed_score}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {flaggedDomains.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 flex items-start gap-2.5">
            <Flag className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{firstName} flagged some of their own 4s</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                In {flaggedDomains.join(', ')}, they weren't fully confident their self-rating holds
                up on a busy day. Worth a gut check together.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {selfAssessment.reflection_formatted && (
        <ReflectionSection
          formatted={selfAssessment.reflection_formatted}
          original={selfAssessment.reflection_original}
        />
      )}

      {orderedDomains.map(domain => {
        const raw = getDomainColorRaw(domain);
        return (
          <div key={domain} className="rounded-lg border overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `hsl(${raw} / 0.1)` }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${raw})` }} />
              <span className="text-sm font-semibold" style={{ color: `hsl(${raw})` }}>{domain}</span>
            </div>
            <div className="divide-y">
              {groupedByDomain[domain].map(r => (
                <div key={r.action_id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.action_statement}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Self {r.self_score === 0 ? 'N/A' : r.self_score}
                        {hasCoachData && (
                          <> · You {r.observed_score == null ? '–' : r.observed_score === 0 ? 'N/A' : r.observed_score}</>
                        )}
                      </p>
                      {r.self_note?.trim() && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{r.self_note.trim()}"</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
