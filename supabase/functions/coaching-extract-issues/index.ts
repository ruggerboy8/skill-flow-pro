import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extracts candidate coaching/operational issues from a meeting or visit transcript
// for the Training Director's workspace. Modeled on extract-insights.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { transcript, locationNames = [] } = await req.json();
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'A transcript is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `# Role
You are a Dental Training Director's assistant. Given a lead-meeting or office-visit transcript, pull out the discrete, trackable ISSUES worth coaching on — concrete operational or clinical things a location or team should improve.

# Rules
- Extract only what is actually in the transcript. Do NOT invent issues.
- Each issue is one specific, coachable thing (not a vague theme). Prefer 3-8 issues; return fewer if that's all there is.
- title: a short, plain-language handle (e.g. "Notes should start at height & weight"). No jargon.
- detail: one or two sentences of context from the transcript. Optional.
- suggested_locations: from the provided location list, ONLY the offices this issue clearly applies to (by name). If it's org-wide or unclear, return an empty array.
- Focus on coaching and organizational health, NOT HR/discipline. Skip anything about firing, write-ups, or individual disciplinary action.

# Available locations
${(locationNames as string[]).join(', ') || '(none provided)'}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_issues',
            description: 'Return the candidate coaching issues found in the transcript.',
            parameters: {
              type: 'object',
              properties: {
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      detail: { type: 'string' },
                      suggested_locations: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['title'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['issues'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'extract_issues' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[coaching-extract-issues] OpenAI error:', errText);
      return new Response(JSON.stringify({ error: 'Extraction failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'extract_issues') {
      return new Response(JSON.stringify({ error: 'No issues extracted' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let parsed: { issues: Array<{ title: string; detail?: string; suggested_locations?: string[] }> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('[coaching-extract-issues] parse error:', e);
      return new Response(JSON.stringify({ error: 'Could not read the extracted issues' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ issues: parsed.issues ?? [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[coaching-extract-issues] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
