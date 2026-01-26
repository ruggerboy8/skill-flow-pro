import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('[format-transcript] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const { transcript, source } = await req.json();

    if (!transcript || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ formatted: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[format-transcript] Formatting transcript, length:', transcript.length, 'source:', source);

    const systemPrompt = `You are a transcript formatter for dental coaching observations. 

Your ONLY job is to make the raw speech-to-text output readable. You must:

1. **Add paragraph breaks** between distinct topics or coaching points
2. **Add speaker attribution** if you can detect dialogue (e.g., "Coach:", "Staff:")
3. **Light punctuation cleanup** - fix run-on sentences, add periods/commas
4. **Preserve the original meaning exactly** - do NOT paraphrase, summarize, or professionalize

DO NOT:
- Remove any content
- Change word choices or "clean up" informal language
- Add interpretations or summaries
- Remove filler words entirely (light cleanup is okay)

The goal is readability while keeping the authentic voice of the recording.

Output format: Plain text with line breaks. No HTML, no markdown headers.`;

    const userPrompt = `Format this raw transcript for readability. Keep all original content:

---
${transcript}
---`;

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
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[format-transcript] OpenAI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later.', formatted: transcript }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402 || response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'OpenAI API authentication or billing issue.', formatted: transcript }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Fallback to raw transcript on error
      return new Response(
        JSON.stringify({ formatted: transcript }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const formatted = data.choices?.[0]?.message?.content?.trim() || transcript;

    console.log('[format-transcript] Formatting complete, output length:', formatted.length);

    return new Response(
      JSON.stringify({ formatted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[format-transcript] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});