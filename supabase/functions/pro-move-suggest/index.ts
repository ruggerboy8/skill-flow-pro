import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { description, roleId, orgId, practiceType } = await req.json();

    if (!description || !roleId || !orgId) {
      return new Response(JSON.stringify({ error: 'description, roleId, orgId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch role name
    const { data: roleData } = await supabase
      .from('roles')
      .select('role_name')
      .eq('role_id', roleId)
      .maybeSingle();
    const roleName = roleData?.role_name ?? 'Unknown';

    // Fetch org visibility overrides (hidden moves)
    const { data: hiddenOverrides } = await supabase
      .from('organization_pro_move_overrides')
      .select('pro_move_id')
      .eq('org_id', orgId)
      .eq('is_hidden', true);
    const hiddenIds = new Set((hiddenOverrides ?? []).map((o: any) => o.pro_move_id));

    // Fetch pro moves for this role (active, not hidden by org)
    const { data: moves, error: movesErr } = await supabase
      .from('pro_moves')
      .select(`
        action_id,
        action_statement,
        description,
        competencies!fk_pro_moves_competency_id(
          name,
          domains!fk_competencies_domain_id(domain_name)
        )
      `)
      .eq('role_id', roleId)
      .eq('active', true)
      .order('action_id');

    if (movesErr) throw movesErr;

    const eligibleMoves = (moves ?? []).filter((m: any) => !hiddenIds.has(m.action_id));

    if (eligibleMoves.length === 0) {
      return new Response(JSON.stringify({ interpretation: 'No eligible pro moves found.', domainFocus: [], suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build pro move library string for the prompt
    const libraryText = eligibleMoves.map((m: any) => {
      const domain = m.competencies?.domains?.domain_name ?? 'Unknown';
      const competency = m.competencies?.name ?? 'Unknown';
      return `ID ${m.action_id} [${domain} > ${competency}]: "${m.action_statement}"${m.description ? ` — ${m.description}` : ''}`;
    }).join('\n');

    const systemPrompt = `You are a dental practice coaching expert helping a practice manager address a specific situation with their ${roleName} team members.${practiceType ? ` Practice type: ${practiceType}.` : ''}

Your job:
1. In one sentence, interpret what operational or skill problem the manager is describing.
2. Identify which domains this problem touches (e.g. "Case Acceptance", "Scheduling", "Clinical").
3. Select 5–8 pro moves from the library that are most relevant to that problem.
4. For each, write one sentence explaining specifically why it addresses the described issue.

Be specific — "this move addresses X by Y" — not generic. If the description is vague, make a reasonable interpretation and state it clearly.`;

    const userPrompt = `Manager's description: "${description}"

Pro move library for ${roleName}:
${libraryText}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_pro_moves',
            description: 'Return pro move recommendations for the described issue',
            parameters: {
              type: 'object',
              required: ['interpretation', 'domain_focus', 'recommendations'],
              properties: {
                interpretation: { type: 'string', description: 'One sentence: how you read the manager\'s problem' },
                domain_focus: { type: 'array', items: { type: 'string' }, description: 'Which domains this problem touches' },
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['action_id', 'relevance', 'rationale'],
                    properties: {
                      action_id: { type: 'integer' },
                      relevance: { type: 'number', description: '0.0–1.0 relevance score' },
                      rationale: { type: 'string', description: 'One sentence why this move addresses the issue' },
                    },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_pro_moves' } },
      }),
    });

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('No tool call in response');

    const llmResult = JSON.parse(toolCall.function.arguments);

    // Enrich recommendations with full move data
    const moveMap = new Map(eligibleMoves.map((m: any) => [m.action_id, m]));
    const enrichedSuggestions = (llmResult.recommendations ?? [])
      .filter((r: any) => moveMap.has(r.action_id))
      .sort((a: any, b: any) => b.relevance - a.relevance)
      .map((r: any) => {
        const move = moveMap.get(r.action_id) as any;
        return {
          action_id: r.action_id,
          action_statement: move.action_statement,
          description: move.description ?? null,
          domain_name: move.competencies?.domains?.domain_name ?? 'Unknown',
          competency_name: move.competencies?.name ?? 'Unknown',
          relevance: r.relevance,
          rationale: r.rationale,
        };
      });

    return new Response(JSON.stringify({
      interpretation: llmResult.interpretation,
      domainFocus: llmResult.domain_focus ?? [],
      suggestions: enrichedSuggestions,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
