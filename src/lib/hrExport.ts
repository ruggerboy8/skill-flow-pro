// Gathers a single staff member's development record for the HR offboarding export.
// Used by the delete flow in AdminUsersTab. Over-reports by default; empty sections are
// surfaced explicitly in the PDF.
import { supabase } from "@/integrations/supabase/client";

export interface EvalItemRecord {
  competency: string;
  domain: string | null;
  observerScore: number | null;
  selfScore: number | null;
  observerNote: string | null;
  selfNote: string | null;
}

export interface EvalRecord {
  type: string | null;
  quarter: string | null;
  programYear: number | null;
  observedAt: string | null;
  status: string | null;
  summaryFeedback: string | null;
  transcript: string | null;
  items: EvalItemRecord[];
}

export interface ParticipationSummary {
  weeksWithActivity: number;
  confidenceSubmitted: number;
  performanceSubmitted: number;
  lateSubmissions: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface StaffRecord {
  name: string;
  email: string | null;
  role: string | null;
  location: string | null;
  hireDate: string | null;
  exportedAt: string;
  evaluations: EvalRecord[];
  participation: ParticipationSummary;
}

export async function gatherStaffRecord(params: {
  staffId: string;
  name: string;
  email?: string | null;
  role?: string | null;
  location?: string | null;
}): Promise<StaffRecord> {
  const { staffId } = params;

  const { data: staff } = await supabase
    .from("staff").select("hire_date").eq("id", staffId).maybeSingle();

  const { data: evals } = await supabase
    .from("evaluations")
    .select("id, type, quarter, program_year, observed_at, status, summary_feedback, summary_raw_transcript, interview_transcript")
    .eq("staff_id", staffId)
    .order("observed_at", { ascending: true });

  const evalIds = (evals ?? []).map((e: any) => e.id);
  const itemsByEval: Record<string, EvalItemRecord[]> = {};
  if (evalIds.length) {
    const { data: items } = await supabase
      .from("evaluation_items")
      .select("evaluation_id, competency_name_snapshot, domain_name, observer_score, self_score, observer_note, self_note, observer_is_na, self_is_na")
      .in("evaluation_id", evalIds);
    (items ?? []).forEach((it: any) => {
      (itemsByEval[it.evaluation_id] ??= []).push({
        competency: it.competency_name_snapshot ?? "Competency",
        domain: it.domain_name ?? null,
        observerScore: it.observer_is_na ? null : it.observer_score,
        selfScore: it.self_is_na ? null : it.self_score,
        observerNote: it.observer_note ?? null,
        selfNote: it.self_note ?? null,
      });
    });
  }

  const evaluations: EvalRecord[] = (evals ?? []).map((e: any) => ({
    type: e.type ?? null,
    quarter: e.quarter ?? null,
    programYear: e.program_year ?? null,
    observedAt: e.observed_at ?? null,
    status: e.status ?? null,
    summaryFeedback: e.summary_feedback ?? null,
    transcript: e.summary_raw_transcript ?? e.interview_transcript ?? null,
    items: itemsByEval[e.id] ?? [],
  }));

  const { data: scores } = await supabase
    .from("weekly_scores")
    .select("confidence_score, performance_score, confidence_date, performance_date, confidence_late, performance_late, week_of")
    .eq("staff_id", staffId);
  const rows = scores ?? [];
  const weeks = new Set(rows.map((r: any) => r.week_of).filter(Boolean));
  const dates = rows
    .map((r: any) => r.performance_date || r.confidence_date)
    .filter(Boolean)
    .sort();
  const participation: ParticipationSummary = {
    weeksWithActivity: weeks.size,
    confidenceSubmitted: rows.filter((r: any) => r.confidence_score != null).length,
    performanceSubmitted: rows.filter((r: any) => r.performance_score != null).length,
    lateSubmissions: rows.filter((r: any) => r.confidence_late || r.performance_late).length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };

  return {
    name: params.name,
    email: params.email ?? null,
    role: params.role ?? null,
    location: params.location ?? null,
    hireDate: staff?.hire_date ?? null,
    exportedAt: new Date().toISOString(),
    evaluations,
    participation,
  };
}
