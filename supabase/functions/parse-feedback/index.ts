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

    const systemPrompt = `You are a professional feedback formatter for staff evaluations in a dental office setting.

Your task is to take raw evaluator feedback (often from a transcribed audio recording) and format it into a clear, professional, staff-facing feedback document.

Guidelines:
- Use a friendly but professional tone
- Organize the feedback clearly with appropriate sections if natural (e.g., strengths, areas for growth, recommendations)
- Fix any grammatical issues from the transcription
- Keep the evaluator's voice and intent intact
- Use bullet points or short paragraphs for readability
- If the feedback is very brief, simply clean it up without adding unnecessary structure
- Address the staff member directly using "you" language
- Focus on actionable, constructive feedback

Do NOT add information that wasn't in the original transcript. Only clean up and format what was said.`;

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
