import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenAI Whisper limit is 25MB (26,214,400 bytes)
const WHISPER_MAX_SIZE = 25 * 1024 * 1024;
// Target chunk size ~20MB to have safety margin
const TARGET_CHUNK_SIZE = 20 * 1024 * 1024;

/**
 * Split audio file into chunks based on byte size.
 * This is a simple byte-based split - works because we're just sending
 * the same format in smaller pieces. Whisper handles partial audio gracefully.
 */
async function splitAudioIntoChunks(audioFile: File): Promise<Blob[]> {
  const arrayBuffer = await audioFile.arrayBuffer();
  const totalSize = arrayBuffer.byteLength;
  
  if (totalSize <= TARGET_CHUNK_SIZE) {
    return [new Blob([arrayBuffer], { type: audioFile.type })];
  }
  
  const chunks: Blob[] = [];
  let offset = 0;
  
  while (offset < totalSize) {
    const chunkSize = Math.min(TARGET_CHUNK_SIZE, totalSize - offset);
    const chunkData = arrayBuffer.slice(offset, offset + chunkSize);
    chunks.push(new Blob([chunkData], { type: audioFile.type }));
    offset += chunkSize;
  }
  
  console.log(`[transcribe-audio] Split ${totalSize} bytes into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Transcribe a single audio chunk using OpenAI Whisper
 */
async function transcribeChunk(
  chunk: Blob, 
  chunkIndex: number, 
  openAIApiKey: string,
  fileName: string
): Promise<string> {
  const whisperFormData = new FormData();
  whisperFormData.append('file', chunk, `chunk_${chunkIndex}_${fileName}`);
  whisperFormData.append('model', 'whisper-1');
  whisperFormData.append('language', 'en');

  console.log(`[transcribe-audio] Transcribing chunk ${chunkIndex + 1}, size: ${chunk.size} bytes`);
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
    },
    body: whisperFormData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[transcribe-audio] Chunk ${chunkIndex + 1} failed:`, response.status, errorText);
    throw new Error(`Chunk ${chunkIndex + 1} transcription failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[transcribe-audio] Chunk ${chunkIndex + 1} transcribed, length: ${data.text?.length || 0}`);
  return data.text || '';
}

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

    // Check if file needs chunking
    if (audioFile.size <= WHISPER_MAX_SIZE) {
      // Small file - direct transcription (existing behavior)
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
        return new Response(
          JSON.stringify({ error: `Transcription failed: ${response.status}`, details: errorText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[transcribe-audio] Transcription successful, length:', data.text?.length || 0);

      return new Response(
        JSON.stringify({ transcript: data.text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Large file - needs chunking
    console.log(`[transcribe-audio] File exceeds ${WHISPER_MAX_SIZE} bytes, chunking...`);
    
    const chunks = await splitAudioIntoChunks(audioFile);
    const transcripts: string[] = [];
    
    // Transcribe chunks sequentially to maintain order
    for (let i = 0; i < chunks.length; i++) {
      const chunkTranscript = await transcribeChunk(
        chunks[i], 
        i, 
        openAIApiKey,
        audioFile.name || 'audio.webm'
      );
      transcripts.push(chunkTranscript);
    }
    
    // Combine all transcripts
    const fullTranscript = transcripts.join(' ');
    console.log(`[transcribe-audio] Combined ${chunks.length} chunks, total length: ${fullTranscript.length}`);

    return new Response(
      JSON.stringify({ 
        transcript: fullTranscript,
        chunked: true,
        chunkCount: chunks.length
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
