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
      console.error('[parse-interview] LOVABLE_API_KEY not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { transcript } = await req.json();

    if (!transcript) {
      console.error('[parse-interview] No transcript provided');
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[parse-interview] Processing transcript of length:', transcript.length);

    const systemPrompt = `You are a transcript formatter. Your task is to take a raw audio transcript from a self-evaluation interview between an Evaluator and a Staff member, and format it to clearly identify who is speaking.

RULES:
1. Identify speaker turns based on context clues (questions vs answers, tone, content)
2. The Evaluator typically asks questions and prompts
3. The Staff member typically responds with self-reflection and examples
4. Format output as HTML with speaker names bolded
5. Use <p><strong>Evaluator:</strong> [their words]</p> format
6. Use <p><strong>Staff:</strong> [their words]</p> format
7. Clean up filler words (um, uh, like) but preserve the meaning
8. Add paragraph breaks between speaker turns
9. If you cannot determine who is speaking, make your best guess based on context
10. Preserve all substantive content from the original transcript`;

    const userPrompt = `Please format this interview transcript by identifying speakers (Evaluator and Staff):

${transcript}`;

    console.log('[parse-interview] Calling Lovable AI...');

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
      console.error('[parse-interview] AI Gateway error:', response.status, errorText);
      
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
        JSON.stringify({ error: 'Failed to parse transcript' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const parsedTranscript = data.choices?.[0]?.message?.content || '';

    console.log('[parse-interview] Successfully parsed transcript, length:', parsedTranscript.length);

    return new Response(
      JSON.stringify({ parsedTranscript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[parse-interview] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
