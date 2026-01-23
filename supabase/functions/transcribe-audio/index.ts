import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Whisper limit is 25MB (26,214,400 bytes)
const WHISPER_MAX_BYTES = 26_214_400;

/**
 * Transcribe audio using OpenAI Whisper API
 * Best for files <= 25MB
 */
async function transcribeWithWhisper(
  audioFile: File,
  openAIApiKey: string
): Promise<{ transcript: string }> {
  const whisperFormData = new FormData();
  whisperFormData.append('file', audioFile, audioFile.name || 'audio.webm');
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
    throw new Error(`Whisper transcription failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[transcribe-audio] Whisper transcription successful, length:', data.text?.length || 0);
  
  return { transcript: data.text };
}

/**
 * Transcribe audio using ElevenLabs Scribe API
 * Used as fallback for files > 25MB (ElevenLabs has higher limits)
 */
async function transcribeWithElevenLabs(
  audioFile: File,
  elevenLabsApiKey: string
): Promise<{ transcript: string }> {
  const formData = new FormData();
  formData.append('file', audioFile, audioFile.name || 'audio.webm');
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'eng');

  console.log('[transcribe-audio] Calling ElevenLabs Scribe API for large file...');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsApiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[transcribe-audio] ElevenLabs API error:', response.status, errorText);
    throw new Error(`ElevenLabs transcription failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[transcribe-audio] ElevenLabs transcription successful, length:', data.text?.length || 0);
  
  return { transcript: data.text };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
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

    const fileSize = audioFile.size;
    console.log('[transcribe-audio] Received audio file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: fileSize,
      sizeInMB: (fileSize / (1024 * 1024)).toFixed(2),
    });

    let result: { transcript: string };
    let service: 'whisper' | 'elevenlabs';

    // Use ElevenLabs for files exceeding Whisper's 25MB limit
    if (fileSize > WHISPER_MAX_BYTES) {
      if (!elevenLabsApiKey) {
        console.error('[transcribe-audio] File exceeds 25MB but ELEVENLABS_API_KEY not configured');
        throw new Error(
          'Audio file exceeds 25MB limit. ElevenLabs API key required for large files but is not configured.'
        );
      }
      
      console.log('[transcribe-audio] File exceeds 25MB, using ElevenLabs Scribe API');
      result = await transcribeWithElevenLabs(audioFile, elevenLabsApiKey);
      service = 'elevenlabs';
    } else {
      console.log('[transcribe-audio] File within Whisper limit, using OpenAI Whisper');
      result = await transcribeWithWhisper(audioFile, openAIApiKey);
      service = 'whisper';
    }

    return new Response(
      JSON.stringify({
        transcript: result.transcript,
        service,
        originalSize: fileSize,
        truncated: false, // We never truncate anymore
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
