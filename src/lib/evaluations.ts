import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Evaluation = Database['public']['Tables']['evaluations']['Row'];
type EvaluationInsert = Database['public']['Tables']['evaluations']['Insert'];
type EvaluationItem = Database['public']['Tables']['evaluation_items']['Row'];

// Types for extracted insights from AI analysis
export interface DomainInsight {
  domain: 'Clinical' | 'Clerical' | 'Cultural' | 'Case Acceptance';
  strengths: string[];
  growth_areas: string[];
}

export interface GrowthPlanItem {
  title: string;
  domain: string;
  observation: string;
  suggested_action: string;
}

export interface ExtractedInsights {
  evaluation_summary_html: string;
  domain_insights: DomainInsight[];
  tactical_growth_plan: GrowthPlanItem[];
}

export interface EvaluationWithItems extends Omit<Evaluation, 'extracted_insights'> {
  items: (EvaluationItem & {
    competency_description?: string;
    interview_prompt?: string;
    domain_name?: string;
    tagline?: string;
  })[];
  extracted_insights?: ExtractedInsights | null;
}

export interface QuarterWindow {
  isInWindow: boolean;
  targetQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  targetYear: number;
}

// Self-assessment prompts per competency - placeholder for now
export const SELF_ASSESSMENT_PROMPTS: Record<number, string> = {
  1: "Reflect on how you've demonstrated this competency in recent weeks. What specific examples can you share?",
  2: "Think about your growth in this area. How would you rate your current performance?",
  3: "Consider the challenges you've faced related to this competency. How have you addressed them?",
  4: "What aspects of this competency do you feel strongest about?",
  // Add more as needed - will be populated by customer
};

/**
 * Create a draft evaluation, seeding with competencies from the staff member's role
 */
export async function createDraftEvaluation({
  staffId,
  roleId,
  locationId,
  type,
  quarter,
  programYear,
  evaluatorId,
  observedAt
}: {
  staffId: string;
  roleId: number;
  locationId: string;
  type: 'Baseline' | 'Midpoint' | 'Quarterly';
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  programYear: number;
  evaluatorId: string;
  observedAt?: Date;
}): Promise<{ evaluation: Evaluation; items: EvaluationItem[] }> {
  // Check if evaluation already exists (draft or submitted) - unique constraint on (staff_id, program_year, quarter, type)
  let existingQuery = supabase
    .from('evaluations')
    .select('*, evaluation_items(*)')
    .eq('staff_id', staffId)
    .eq('program_year', programYear)
    .eq('type', type);

  if (quarter) {
    existingQuery = existingQuery.eq('quarter', quarter);
  } else {
    existingQuery = existingQuery.is('quarter', null);
  }

  const { data: existingEval } = await existingQuery.maybeSingle();

  if (existingEval) {
    if (existingEval.status === 'submitted') {
      throw new Error(`A ${type} evaluation for ${quarter || 'this period'} ${programYear} has already been submitted. You cannot create a duplicate.`);
    }
    // Return existing draft
    return {
      evaluation: existingEval,
      items: existingEval.evaluation_items || []
    };
  }

  // Get competencies for the role with domain info
  const { data: competencies, error: competenciesError } = await supabase
    .from('competencies')
    .select(`
      competency_id, 
      name,
      domain_id,
      domains!competencies_domain_id_fkey(domain_name)
    `)
    .eq('role_id', roleId);

  if (competenciesError) {
    throw new Error(`Failed to fetch competencies: ${competenciesError.message}`);
  }

  if (!competencies || competencies.length === 0) {
    throw new Error('No competencies found for this role');
  }

  // Create evaluation
  const evaluationData: EvaluationInsert = {
    staff_id: staffId,
    role_id: roleId,
    location_id: locationId,
    type,
    quarter: quarter || null,
    program_year: programYear,
    evaluator_id: evaluatorId,
    observed_at: observedAt?.toISOString()
  };

  const { data: evaluation, error: evalError } = await supabase
    .from('evaluations')
    .insert(evaluationData)
    .select()
    .single();

  if (evalError) {
    throw new Error(`Failed to create evaluation: ${evalError.message}`);
  }

  // Create evaluation items with domain data
  const itemsData = competencies.map(comp => ({
    evaluation_id: evaluation.id,
    competency_id: comp.competency_id,
    competency_name_snapshot: comp.name || `Competency ${comp.competency_id}`,
    domain_id: comp.domain_id,
    domain_name: (comp.domains as { domain_name: string } | null)?.domain_name || null
  }));

  const { data: items, error: itemsError } = await supabase
    .from('evaluation_items')
    .insert(itemsData)
    .select();

  if (itemsError) {
    throw new Error(`Failed to create evaluation items: ${itemsError.message}`);
  }

  return { evaluation, items: items || [] };
}

/**
 * Get all evaluations for a staff member, separated by status
 */
export async function getEvaluationsForStaff(staffId: string) {
  const { data, error } = await supabase
    .from('evaluations')
    .select(`
      *,
      evaluation_items(*)
    `)
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch evaluations: ${error.message}`);
  }

  const drafts = (data || []).filter(evaluation => evaluation.status === 'draft');
  const submitted = (data || []).filter(evaluation => evaluation.status === 'submitted');

  return { drafts, submitted };
}

/**
 * Get a single evaluation with all items and competency details
 */
export async function getEvaluation(evalId: string): Promise<EvaluationWithItems | null> {
  // First get the evaluation and basic items
  const { data, error } = await supabase
    .from('evaluations')
    .select(`
      *,
      evaluation_items(*)
    `)
    .eq('id', evalId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch evaluation: ${error.message}`);
  }

  if (!data) return null;

  const items = data.evaluation_items || [];

  // Get competency details separately
  const competencyIds = items.map(item => item.competency_id);
  
  if (competencyIds.length === 0) {
    return {
      ...data,
      items: [],
      extracted_insights: data.extracted_insights 
        ? (data.extracted_insights as unknown as ExtractedInsights)
        : null
    } as EvaluationWithItems;
  }

  // Use a simple query to get competency details including tagline
  const { data: competencies, error: competencyError } = await supabase
    .from('competencies')
    .select(`
      competency_id,
      description,
      interview_prompt,
      domain_id,
      tagline
    `)
    .in('competency_id', competencyIds);

  if (competencyError) {
    console.error('Error fetching competency details:', competencyError);
  }

  // Get domains separately
  const domainIds = competencies?.map(c => c.domain_id).filter(id => id !== null) || [];
  let domains: any[] = [];
  
  if (domainIds.length > 0) {
    const { data: domainsData } = await supabase
      .from('domains')
      .select('domain_id, domain_name')
      .in('domain_id', domainIds);
    domains = domainsData || [];
  }

  // Create domain map
  const domainMap = new Map();
  domains.forEach(domain => {
    domainMap.set(domain.domain_id, domain.domain_name);
  });

  // Create a map for quick lookup
  const competencyMap = new Map();
  if (competencies) {
    competencies.forEach((comp: any) => {
      competencyMap.set(comp.competency_id, {
        description: comp.description,
        interview_prompt: comp.interview_prompt,
        domain_name: domainMap.get(comp.domain_id) || '',
        tagline: comp.tagline || ''
      });
    });
  }

  // Transform the items to include competency details
  const transformedItems = items.map(item => {
    const competency = competencyMap.get(item.competency_id);
    return {
      ...item,
      competency_description: competency?.description || '',
      interview_prompt: competency?.interview_prompt || '',
      domain_name: competency?.domain_name || '',
      tagline: competency?.tagline || ''
    };
  });

  console.log('Transformed evaluation items:', transformedItems.slice(0, 2)); // Debug log

  // Parse extracted_insights from JSON if present
  const extractedInsights = data.extracted_insights 
    ? (data.extracted_insights as unknown as ExtractedInsights)
    : null;

  return {
    ...data,
    items: transformedItems,
    extracted_insights: extractedInsights
  } as EvaluationWithItems;
}

/**
 * Update observer score for a competency
 */
export async function setObserverScore(
  evalId: string,
  competencyId: number,
  score: number | null
) {
  const { error } = await supabase
    .from('evaluation_items')
    .update({ observer_score: score })
    .eq('evaluation_id', evalId)
    .eq('competency_id', competencyId);

  if (error) {
    throw new Error(`Failed to update observer score: ${error.message}`);
  }
}

/**
 * Update observer note for a competency
 */
export async function setObserverNote(
  evalId: string,
  competencyId: number,
  note: string
) {
  const { error } = await supabase
    .from('evaluation_items')
    .update({ observer_note: note })
    .eq('evaluation_id', evalId)
    .eq('competency_id', competencyId);

  if (error) {
    throw new Error(`Failed to update observer note: ${error.message}`);
  }
}

/**
 * Update self score for a competency
 */
export async function setSelfScore(
  evalId: string,
  competencyId: number,
  score: number | null
) {
  const { error } = await supabase
    .from('evaluation_items')
    .update({ self_score: score })
    .eq('evaluation_id', evalId)
    .eq('competency_id', competencyId);

  if (error) {
    throw new Error(`Failed to update self score: ${error.message}`);
  }
}

/**
 * Update self note for a competency
 */
export async function setSelfNote(
  evalId: string,
  competencyId: number,
  note: string
) {
  const { error } = await supabase
    .from('evaluation_items')
    .update({ self_note: note })
    .eq('evaluation_id', evalId)
    .eq('competency_id', competencyId);

  if (error) {
    throw new Error(`Failed to update self note: ${error.message}`);
  }
}

/**
 * Update evaluation metadata (type, quarter, and observed date)
 */
export async function updateEvaluationMetadata(
  evalId: string,
  data: { type?: string; quarter?: string | null; observed_at?: string }
) {
  const { error } = await supabase
    .from('evaluations')
    .update(data)
    .eq('id', evalId);

  if (error) {
    throw new Error(`Failed to update evaluation metadata: ${error.message}`);
  }
}

/**
 * Update summary feedback and raw transcript
 */
export async function updateSummaryFeedback(
  evalId: string,
  data: { summary_feedback?: string; summary_raw_transcript?: string }
) {
  const { error } = await supabase
    .from('evaluations')
    .update(data)
    .eq('id', evalId);

  if (error) {
    throw new Error(`Failed to update summary feedback: ${error.message}`);
  }
}

/**
 * Update the interview transcript from audio transcription
 */
export async function updateInterviewTranscript(
  evalId: string,
  interviewTranscript: string
) {
  const { error } = await supabase
    .from('evaluations')
    .update({ interview_transcript: interviewTranscript })
    .eq('id', evalId);

  if (error) {
    throw new Error(`Failed to update interview transcript: ${error.message}`);
  }
}

/**
 * Submit an evaluation (mark as completed)
 */
export async function submitEvaluation(evalId: string) {
  const { error } = await supabase
    .from('evaluations')
    .update({ status: 'submitted' })
    .eq('id', evalId);

  if (error) {
    throw new Error(`Failed to submit evaluation: ${error.message}`);
  }
}

/**
 * Delete an evaluation and all its items
 */
export async function deleteEvaluation(evalId: string) {
  // First delete evaluation items
  const { error: itemsError } = await supabase
    .from('evaluation_items')
    .delete()
    .eq('evaluation_id', evalId);

  if (itemsError) {
    throw new Error(`Failed to delete evaluation items: ${itemsError.message}`);
  }

  // Then delete the evaluation
  const { error: evalError } = await supabase
    .from('evaluations')
    .delete()
    .eq('id', evalId);

  if (evalError) {
    throw new Error(`Failed to delete evaluation: ${evalError.message}`);
  }
}

/**
 * Check if evaluation is complete (all items have both observer and self scores)
 */
export function isEvaluationComplete(evaluation: EvaluationWithItems): { 
  observerComplete: boolean; 
  selfComplete: boolean; 
  canSubmit: boolean 
} {
  const observerComplete = evaluation.items.every(item => item.observer_score !== null);
  const selfComplete = evaluation.items.every(item => item.self_score !== null);
  
  return {
    observerComplete,
    selfComplete,
    canSubmit: observerComplete && selfComplete
  };
}

/**
 * Update extracted insights from interview analysis
 */
export async function updateExtractedInsights(
  evalId: string,
  insights: ExtractedInsights
) {
  const { error } = await supabase
    .from('evaluations')
    .update({ extracted_insights: insights as unknown as Database['public']['Tables']['evaluations']['Update']['extracted_insights'] })
    .eq('id', evalId);

  if (error) {
    throw new Error(`Failed to update extracted insights: ${error.message}`);
  }
}

/**
 * Get quarter window information for a given date and timezone
 */
export function getQuarterWindow(now: Date, timezone: string): QuarterWindow {
  // Create date in the given timezone
  const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const year = nowInTz.getFullYear();
  
  // Quarter boundaries (start of each quarter)
  const quarterBoundaries = [
    { date: new Date(year, 0, 1), quarter: 'Q1' as const }, // Jan 1
    { date: new Date(year, 3, 1), quarter: 'Q2' as const }, // Apr 1
    { date: new Date(year, 6, 1), quarter: 'Q3' as const }, // Jul 1
    { date: new Date(year, 9, 1), quarter: 'Q4' as const }, // Oct 1
    { date: new Date(year + 1, 0, 1), quarter: 'Q1' as const }, // Next year Q1
  ];

  // Find the nearest boundary
  let nearestBoundary = quarterBoundaries[0];
  let minDistance = Math.abs(nowInTz.getTime() - quarterBoundaries[0].date.getTime());

  for (const boundary of quarterBoundaries) {
    const distance = Math.abs(nowInTz.getTime() - boundary.date.getTime());
    if (distance < minDistance) {
      minDistance = distance;
      nearestBoundary = boundary;
    }
  }

  // Check if within ±1.5 weeks (11 days)
  const elevenDays = 11 * 24 * 60 * 60 * 1000;
  const isInWindow = minDistance <= elevenDays;

  // Determine target year - if the nearest boundary is next year's Q1, use next year
  const targetYear = nearestBoundary.date.getFullYear();

  return {
    isInWindow,
    targetQuarter: nearestBoundary.quarter,
    targetYear
  };
}