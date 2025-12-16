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
      console.error('[parse-feedback] LOVABLE_API_KEY not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { transcript, staffName } = await req.json();
    
    if (!transcript) {
      console.error('[parse-feedback] No transcript provided');
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[parse-feedback] Processing transcript, length:', transcript.length);

    const systemPrompt = `# Role & Objective
You are an expert Dental Leadership Coach and Communications Specialist. Your goal is to take a raw, unpolished audio transcript from a dental staff evaluator and transform it into a supportive, clear, and inspiring feedback document.

# Input Context
The input is a raw transcript of an evaluator speaking about a staff member. It may contain:
- Filler words (um, uh, like)
- Run-on sentences
- Informal phrasing
- Disorganized thoughts

# Output Requirements
Transform the input into a polished summary using the following guidelines:

1.  **Tone:**
    - **Supportive & Coaching-Oriented:** Even when delivering criticism, frame it as an opportunity for growth ("Let's focus on..." instead of "You are bad at...").
    - **Dental Professional:** Use appropriate terminology if present (e.g., "operatory," "patient flow," "sterilization protocol") but keep it accessible.
    - **Direct Address:** Speak directly to the staff member using "You."

2.  **Structure & Formatting (HTML for Quill):**
    - You must output **only** the HTML fragment (do not include \`\`\`html blocks, <html>, <head>, or <body> tags).
    - Use <h3> tags for section headers.
    - Use <p> tags for standard text.
    - Use <ul> and <li> tags for listing specific examples or action items.
    - Use <strong> tags to highlight key wins or crucial focus areas.
    - **Do not** use Markdown. Use strictly valid HTML tags.

3.  **Content Organization:**
    - If the input is long enough, organize it into logical sections such as:
        - <h3>Overall Impressions</h3>
        - <h3>Key Strengths</h3>
        - <h3>Areas for Growth</h3>
    - If the input is short (under 3 sentences), format it as a single, well-written paragraph without headers.

4.  **Editing Rules:**
    - Remove all filler words and stuttering.
    - Fix all grammar and syntax errors.
    - **CRITICAL:** Do not invent feedback. If the evaluator didn't say it, do not add it. You may expand *phrasing* for clarity, but do not expand *facts*.

# Example Output Style
<h3>Overall Impressions</h3>
<p>Jane, thank you for a productive quarter. It is clear that you have become a vital part of our hygiene team, particularly in how you manage <strong>patient anxiety</strong>.</p>

<h3>Areas for Focus</h3>
<ul>
    <li><strong>Periodontal Charting:</strong> Let's work on ensuring your probing depths are recorded more consistently during the morning rush.</li>
    <li><strong>Handoffs:</strong> Please focus on clearer communication with the front desk when dismissing patients.</li>
</ul>`;

    const userPrompt = `Please format this evaluator feedback${staffName ? ` for ${staffName}` : ''} into a professional staff-facing document:

---
${transcript}
---`;

    console.log('[parse-feedback] Calling Lovable AI Gateway...');

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parse-feedback] AI Gateway error:', response.status, errorText);
      
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
    const formattedFeedback = data.choices?.[0]?.message?.content || '';
    
    console.log('[parse-feedback] Formatting successful, output length:', formattedFeedback.length);

    return new Response(
      JSON.stringify({ formattedFeedback }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[parse-feedback] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
