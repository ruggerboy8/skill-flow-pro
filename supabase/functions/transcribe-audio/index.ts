import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Whisper limit is 25MB (26,214,400 bytes). The API enforces this.
// We keep a small safety buffer below the max to avoid edge/overhead issues.
const WHISPER_MAX_BYTES = 26_214_400;
const WHISPER_SAFE_BYTES = 26_200_000;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('[transcribe-audio] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      console.error('[transcribe-audio] No audio file provided');
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] Received audio file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size
    });

    // If the file is just above the limit, we can safely TRIM the tail to fit.
    // Note: We cannot byte-split WebM into multiple parts reliably without remuxing.
    let fileToSend: Blob = audioFile;
    let truncated = false;
    const originalSize = audioFile.size;

    if (audioFile.size > WHISPER_MAX_BYTES) {
      truncated = true;
      fileToSend = audioFile.slice(0, WHISPER_SAFE_BYTES, audioFile.type);
      console.log('[transcribe-audio] Audio exceeds Whisper 25MB limit; trimming tail:', {
        originalSize,
        trimmedSize: fileToSend.size,
      });
    }

    const whisperFormData = new FormData();
    whisperFormData.append('file', fileToSend, audioFile.name || 'audio.webm');
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('language', 'en');

    console.log('[transcribe-audio] Calling OpenAI Whisper API...');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[transcribe-audio] Whisper API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[transcribe-audio] Transcription successful, length:', data.text?.length || 0);

    return new Response(
      JSON.stringify({
        transcript: data.text,
        truncated,
        originalSize,
        usedSize: fileToSend.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
