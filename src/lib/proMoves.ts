import { supabase } from '@/integrations/supabase/client';

export async function fetchProMoveMetaByIds(actionIds: number[]) {
  if (!actionIds.length) return new Map<number, { statement: string; domain: string }>();

  // 1) pro_moves → action_id, action_statement, competency_id
  const { data: moves } = await supabase
    .from('pro_moves')
    .select('action_id, action_statement, competency_id')
    .in('action_id', actionIds);

  const compIds = Array.from(new Set((moves || []).map(m => m.competency_id)));
  if (!compIds.length) return new Map();

  // 2) competencies (with domain)
  const { data: comps } = await supabase
    .from('competencies')
    .select('competency_id, domains:fk_competencies_domain_id(domain_name)')
    .in('competency_id', compIds);

  const compMap = new Map(comps?.map(c => [c.competency_id, c]) || []);

  // 3) join in JS
  const map = new Map<number, { statement: string; domain: string }>();
  (moves || []).forEach(m => {
    const c = compMap.get(m.competency_id);
    map.set(m.action_id, {
      statement: m.action_statement || '',
      domain: (c?.domains as any)?.domain_name || '',
    });
  });
  return map;
}
