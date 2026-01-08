import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to strip markdown to plain text
function stripMarkdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')   // code blocks
    .replace(/`[^`]*`/g, '')          // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')   // links
    .replace(/[#>*_~`>-]+/g, '')      // md syntax chars
    .replace(/\s+/g, ' ')
    .trim();
}

// Map voice names to Hume voice IDs (only include valid UUIDs)
// If a voice isn't in this map, the code will fall back to using the name directly
const VOICE_ID_MAP: Record<string, string> = {
  'Jessica': '03012e0c-8b7e-4c9d-9579-04bea0a56674'
  // Add more voice IDs here when you have valid UUIDs from Hume
};

// Compute SHA-256 hash of text for integrity checking
async function computeScriptHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const humeApiKey = Deno.env.get('HUME_API_KEY');
    const humeSecretKey = Deno.env.get('HUME_SECRET_KEY');

    if (!humeApiKey || !humeSecretKey) {
      throw new Error('HUME_API_KEY or HUME_SECRET_KEY not configured');
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is super admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: staffData } = await supabase
      .from('staff')
      .select('is_super_admin, is_coach, is_org_admin')
      .eq('user_id', user.id)
      .single();

    // Allow super admins, coaches, and org admins
    const hasAccess = staffData?.is_super_admin || staffData?.is_coach || staffData?.is_org_admin;
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin or coach access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { scriptMd, voiceName = 'Ava Song', actingInstructions, mode = 'generate' } = await req.json();

    if (!scriptMd) {
      return new Response(JSON.stringify({ error: 'Missing scriptMd' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert markdown to plain text
    const text = stripMarkdownToText(scriptMd);
    if (!text) {
      return new Response(JSON.stringify({ error: 'Empty script after processing' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating audio with voice ${voiceName}, mode: ${mode}`);
    console.log(`Text length: ${text.length} characters`);

    // Compute script hash for integrity checking
    const scriptHash = await computeScriptHash(text);

    // Get voice ID - try to use ID if voice name is recognized, otherwise use name
    const voiceId = VOICE_ID_MAP[voiceName];
    const voiceConfig = voiceId 
      ? { id: voiceId }
      : { name: voiceName, provider: 'HUME_AI' };

    // Call Hume TTS API (v0) using direct HTTP
    const humeResponse = await fetch('https://api.hume.ai/v0/tts', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': humeApiKey,
        'X-Hume-Secret-Key': humeSecretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        utterances: [
          {
            text,
            voice: voiceConfig,
            ...(actingInstructions ? { description: actingInstructions } : {})
          }
        ]
      }),
    });

    if (!humeResponse.ok) {
      const errorText = await humeResponse.text();
      console.error('Hume API error:', humeResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Hume TTS failed', details: errorText }), 
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the JSON response with base64 audio
    const result = await humeResponse.json();
    const audioBase64 = result.generations?.[0]?.audio;
    const generationId = result.generations?.[0]?.id || crypto.randomUUID();
    
    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: 'No audio data returned from Hume' }), 
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Generated audio: ${audioBase64.length} base64 chars, generation_id: ${generationId}`);

    // Return audio data for client-side preview (no DB/Storage write in generate mode)
    return new Response(
      JSON.stringify({
        audioBase64,
        scriptHash,
        generationId,
        voiceName,
        textLength: text.length,
        // Estimate duration (very rough: ~150 words/min, ~5 chars/word)
        durationSec: Math.ceil((text.length / 5) / 150 * 60)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (e: any) {
    console.error('generate-audio error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});