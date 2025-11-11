import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staffData?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { actionId, scriptMd, voiceName = 'Ava Song', actingInstructions } = await req.json();

    if (!actionId || !scriptMd) {
      return new Response(JSON.stringify({ error: 'Missing actionId or scriptMd' }), {
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

    console.log(`Generating audio for action ${actionId} with voice ${voiceName}`);
    console.log(`Text length: ${text.length} characters`);

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
            voice: {
              name: voiceName,
              provider: 'HUME_AI'
            },
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
    
    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: 'No audio data returned from Hume' }), 
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Decode base64 to binary
    const audioBuf = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

    console.log(`Received audio: ${audioBuf.length} bytes`);

    // Upload to Supabase Storage
    const ts = Date.now();
    const filename = `action-${actionId}/pm-audio-${ts}.wav`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pro-move-audio')
      .upload(filename, audioBuf, { 
        contentType: 'audio/wav',
        upsert: true 
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Upload failed', details: uploadError.message }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('pro-move-audio')
      .getPublicUrl(filename);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return new Response(
        JSON.stringify({ error: 'Unable to resolve public URL' }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Audio uploaded to: ${publicUrl}`);

    // Remove any existing audio for this action
    await supabase
      .from('pro_move_resources')
      .delete()
      .eq('action_id', actionId)
      .eq('type', 'audio');

    // Insert new audio resource
    const { data: inserted, error: insertError } = await supabase
      .from('pro_move_resources')
      .insert({
        action_id: actionId,
        type: 'audio',
        provider: 'hume',
        url: publicUrl,
        display_order: 2,
        status: 'published',
        metadata: {
          voiceName,
          generatedAt: new Date().toISOString(),
          mime: 'audio/wav',
          textLength: text.length,
          ...(actingInstructions ? { actingInstructions } : {})
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('DB insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'DB insert failed', details: insertError.message }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Audio resource created: ${inserted.id}`);

    return new Response(
      JSON.stringify({
        resourceId: inserted.id,
        url: publicUrl,
        voiceName,
        textLength: text.length
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