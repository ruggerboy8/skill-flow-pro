import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Evaluation = Database['public']['Tables']['evaluations']['Row'];
type EvaluationInsert = Database['public']['Tables']['evaluations']['Insert'];
type EvaluationItem = Database['public']['Tables']['evaluation_items']['Row'];

export interface EvaluationWithItems extends Evaluation {
  items: (EvaluationItem & {
    competency_description?: string;
    interview_prompt?: string;
    domain_name?: string;
  })[];
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
  // Check if draft already exists (idempotent)
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_items(*)')
    .eq('staff_id', staffId)
    .eq('program_year', programYear)
    .eq('type', type)
    .eq('status', 'draft');

  if (quarter) {
    query = query.eq('quarter', quarter);
  } else {
    query = query.is('quarter', null);
  }

  const { data: existingEval } = await query.maybeSingle();

  if (existingEval) {
    return {
      evaluation: existingEval,
      items: existingEval.evaluation_items || []
    };
  }

  // Get competencies for the role
  const { data: competencies, error: competenciesError } = await supabase
    .from('competencies')
    .select('competency_id, name')
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

  // Create evaluation items
  const itemsData = competencies.map(comp => ({
    evaluation_id: evaluation.id,
    competency_id: comp.competency_id,
    competency_name_snapshot: comp.name || `Competency ${comp.competency_id}`
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
 * Get a single evaluation with all items
 */
export async function getEvaluation(evalId: string): Promise<EvaluationWithItems | null> {
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

  // Fetch competency details separately for each item
  const items = data.evaluation_items || [];
  const competencyIds = items.map(item => item.competency_id);
  
  if (competencyIds.length > 0) {
    const { data: competencies } = await supabase
      .from('competencies')
      .select(`
        competency_id,
        description,
        interview_prompt,
        domains!inner(domain_name)
      `)
      .in('competency_id', competencyIds);

    // Create a map for quick lookup
    const competencyMap = new Map();
    competencies?.forEach(comp => {
      competencyMap.set(comp.competency_id, comp);
    });

    // Transform the items to include competency details
    const transformedItems = items.map(item => {
      const competency = competencyMap.get(item.competency_id);
      return {
        ...item,
        competency_description: competency?.description || '',
        interview_prompt: competency?.interview_prompt || '',
        domain_name: competency?.domains?.domain_name || ''
      };
    });

    return {
      ...data,
      items: transformedItems
    };
  }

  return {
    ...data,
    items: items
  };
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