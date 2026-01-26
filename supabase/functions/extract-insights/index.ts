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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('[extract-insights] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const { transcript, staffName, source = 'interview' } = await req.json();
    
    if (!transcript) {
      console.error('[extract-insights] No transcript provided');
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[extract-insights] Processing transcript, source:', source, 'length:', transcript.length);

    // Different prompts based on source
    const systemPrompt = source === 'observation' 
      ? `# Role & Objective
You are an expert Dental Leadership Coach. Your task is to transform a coach's spoken observations into a polished, professional evaluation record.

# Input Context
- Speaker: A Dental Coach/Evaluator
- Subject: A Staff Member
- Content: Performance observations across Clinical, Clerical, Cultural, and Case Acceptance domains.

# Output Requirements
You must call the extract_insights function with structured data.

1. **summary_html**:
   - Write a 3-5 sentence professional paragraph summarizing the performance.
   - **Tone:** Constructive and appreciative.
   - **Syntax:** Third Person (e.g., "Sarah effectively handles...").
   - Format as HTML (<p>, <strong> tags as needed).

2. **domain_insights**:
   - **Strengths:** Extract specific wins and positive behaviors.
   - **Growth Opportunities:** Reframe criticism into **forward-looking goals**.
     - Start with action verbs: "Focus on...", "Develop...", "Enhance...", "Refine..."
     - Bad: "She forgets to stock rooms."
     - Good: "Ensure consistent room stocking protocols are followed."
   - Only include domains that were actually discussed.

# Critical Rules (The "Professional Filter")
- **Standardize Terminology:** Replace informal team references (e.g., "the girls", "the front") with professional terms ("the clinical team", "the administrative team").
- **Remove Frustration:** If the coach sounds annoyed, strip the emotion and keep the coaching point.
- **No Verbatim Slang:** Do not put slang in quotes. Summarize the *behavior*, not the specific word.
- **Only extract what was actually said**—do not invent content.
- **Map insights to the correct domains** based on context:
  - Clinical: Patient care, procedures, sterilization, clinical protocols
  - Clerical: Scheduling, paperwork, administrative tasks, organization
  - Cultural: Teamwork, communication, attitude, professional presence
  - Case Acceptance: Treatment presentation, patient education, financial discussions`
      : `# Role & Objective
You are an expert Dental Leadership Coach. Your task is to synthesize a self-evaluation interview into a professional record of "Shared Understanding."

# Input Context
- A collaborative conversation between an Evaluator and Staff Member.
- The Staff Member reflects on their own performance.

# Output Requirements
You must call the extract_insights function with structured data.

1. **summary_html**:
   - Write a 3-5 sentence paragraph summarizing the staff member's self-awareness and alignment with the evaluator.
   - Use Third Person (e.g., "Vanessa identified...", "She acknowledged...").
   - Format as HTML (<p>, <strong> tags as needed).

2. **domain_insights**:
   - **Strengths:** Areas where the staff member expressed confidence that was validated by the evaluator.
   - **Growth Opportunities:** Areas where the staff member identified a gap or accepted coaching.
     - **Constraint:** These must be written as **objectives**, not confessions.
     - Bad: "Admitted she is too goofy."
     - Good: "Aim to balance natural optimism with professional composure."
     - Bad: "Says she is bad at X."
     - Good: "Identified a desire for additional training in X."
   - Only include domains that were actually discussed.

# Critical Rules (The "Professional Filter")
- **Protect the Staff Member:** Never include self-deprecating quotes (e.g., "I'm stupid," "I messed up"). Translate these into "Identified a gap in..." or "Opportunity to refine..."
- **Elevate the Language:** Convert informal phrases into professional competency equivalents:
  - "The girls" → "The Team"
  - "Goofy/Silly" → "Professional Presence"
  - "Rushing" → "Time Management"
  - "Forgetting" → "Process Consistency"
- **Only extract what was actually said**—do not invent content.
- **Map insights to the correct domains** based on context:
  - Clinical: Patient care, procedures, sterilization, clinical protocols
  - Clerical: Scheduling, paperwork, administrative tasks, organization
  - Cultural: Teamwork, communication, attitude, professional presence
  - Case Acceptance: Treatment presentation, patient education, financial discussions`;

    const userPrompt = source === 'observation'
      ? `Please analyze this coach's observation recording${staffName ? ` about ${staffName}` : ''} and extract structured, HR-safe insights. Apply the Professional Filter to elevate informal language:

---
${transcript}
---`
      : `Please analyze this self-evaluation interview transcript${staffName ? ` for ${staffName}` : ''} and extract structured, HR-safe insights. Apply the Professional Filter to protect and elevate the staff member's words:

---
${transcript}
---`;

    console.log('[extract-insights] Calling OpenAI API with tool calling...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_insights',
              description: 'Extract structured insights from the transcript',
              parameters: {
                type: 'object',
                properties: {
                  summary_html: {
                    type: 'string',
                    description: '3-5 sentence HTML paragraph summarizing the key observations or self-assessment'
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
                          description: 'Growth opportunities identified in this domain'
                        }
                      },
                      required: ['domain', 'strengths', 'growth_areas']
                    },
                    description: 'Insights organized by domain'
                  }
                },
                required: ['summary_html', 'domain_insights']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_insights' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[extract-insights] OpenAI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402 || response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'OpenAI API authentication or billing issue. Please check your API key.' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      source,
      summaryLength: insights.summary_html?.length,
      domainCount: insights.domain_insights?.length
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