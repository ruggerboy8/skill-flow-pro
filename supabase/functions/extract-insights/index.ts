import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('[extract-insights] LOVABLE_API_KEY not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { transcript, staffName } = await req.json();
    
    if (!transcript) {
      console.error('[extract-insights] No transcript provided');
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[extract-insights] Processing transcript, length:', transcript.length);

    const systemPrompt = `# Role & Objective
You are an expert Dental Leadership Coach analyzing a self-evaluation interview transcript. Your goal is to extract structured, actionable insights from the conversation between an evaluator and a staff member.

# Input Context
The input is a diarized transcript of an interview where:
- The Evaluator asks questions about competencies
- The Staff member reflects on their own performance
- The conversation covers various domains: Clinical, Clerical, Cultural, and Case Acceptance

# Output Requirements
You must call the extract_insights function with structured data. Follow these guidelines:

1. **evaluation_summary_html**: Write a 3-5 sentence professional paragraph summarizing:
   - The staff member's level of self-awareness
   - Their receptiveness to feedback
   - Key themes from their self-reflection
   Format as HTML (use <p>, <strong> tags as needed).

2. **domain_insights**: For each domain mentioned, identify:
   - Domain name (must be exactly: "Clinical", "Clerical", "Cultural", or "Case Acceptance")
   - Strengths the staff member demonstrated or acknowledged
   - Growth areas they identified or were coached on
   Only include domains that were actually discussed.

3. **tactical_growth_plan**: Extract 2-4 forward-looking coaching goals:
   - Title: Brief action-oriented title
   - Domain: Which domain this relates to
   - Observation: What was noticed or discussed
   - Suggested action: Concrete next step for improvement

# Critical Rules
- Only extract what was actually said—do not invent content
- Use supportive, coaching-oriented language
- Map insights to the correct domains based on context
- Keep tactical goals specific and actionable`;

    const userPrompt = `Please analyze this self-evaluation interview transcript${staffName ? ` for ${staffName}` : ''} and extract structured insights:

---
${transcript}
---`;

    console.log('[extract-insights] Calling Lovable AI Gateway with tool calling...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_insights',
              description: 'Extract structured insights from the interview transcript',
              parameters: {
                type: 'object',
                properties: {
                  evaluation_summary_html: {
                    type: 'string',
                    description: '3-5 sentence HTML paragraph summarizing staff self-awareness and receptiveness'
                  },
                  domain_insights: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        domain: {
                          type: 'string',
                          enum: ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'],
                          description: 'The domain this insight relates to'
                        },
                        strengths: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Strengths identified in this domain'
                        },
                        growth_areas: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Areas for growth identified in this domain'
                        }
                      },
                      required: ['domain', 'strengths', 'growth_areas'],
                      additionalProperties: false
                    },
                    description: 'Insights organized by domain'
                  },
                  tactical_growth_plan: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: {
                          type: 'string',
                          description: 'Brief action-oriented title for this goal'
                        },
                        domain: {
                          type: 'string',
                          description: 'Which domain this relates to'
                        },
                        observation: {
                          type: 'string',
                          description: 'What was noticed or discussed'
                        },
                        suggested_action: {
                          type: 'string',
                          description: 'Concrete next step for improvement'
                        }
                      },
                      required: ['title', 'domain', 'observation', 'suggested_action'],
                      additionalProperties: false
                    },
                    description: '2-4 forward-looking coaching goals'
                  }
                },
                required: ['evaluation_summary_html', 'domain_insights', 'tactical_growth_plan'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_insights' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[extract-insights] AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI processing failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[extract-insights] Raw response:', JSON.stringify(data, null, 2));
    
    // Extract the tool call arguments
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'extract_insights') {
      console.error('[extract-insights] No valid tool call in response');
      return new Response(
        JSON.stringify({ error: 'AI did not return structured insights' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let insights;
    try {
      insights = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error('[extract-insights] Failed to parse tool arguments:', parseError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[extract-insights] Extraction successful:', {
      summaryLength: insights.evaluation_summary_html?.length,
      domainCount: insights.domain_insights?.length,
      goalCount: insights.tactical_growth_plan?.length
    });

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[extract-insights] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
