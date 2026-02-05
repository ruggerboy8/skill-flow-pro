/**
 * Audio Transcription Utilities
 * 
 * For already-recorded blobs (uploaded/stored files), we send the whole file
 * to the transcribe-audio edge function which uses ElevenLabs for files >25MB.
 * 
 * For LIVE recordings, use MediaRecorder segmentation (via useAudioRecording hook)
 * which creates valid audio segments during recording.
 * 
 * NOTE: Byte-level blob.slice() does NOT work for transcription because it creates
 * invalid audio files (missing headers, broken container format).
 */

import { supabase } from '@/integrations/supabase/client';

// Threshold for showing progress - above this we use ElevenLabs on the server
export const CHUNK_SIZE_BYTES = 20 * 1024 * 1024; // 20MB (for progress UI only)

export interface ChunkProgress {
  currentChunk: number;
  totalChunks: number;
  phase: 'chunking' | 'transcribing' | 'complete';
}

export interface ChunkResult {
  transcript: string;
  service: 'whisper' | 'elevenlabs';
  chunked: boolean;
  totalChunks: number;
}

/**
 * Transcribe an audio blob by sending the entire file to the edge function.
 * The edge function handles files >25MB via ElevenLabs fallback.
 * 
 * @param blob - The audio blob to transcribe
 * @param onProgress - Optional callback for progress updates
 * @returns Transcript and metadata
 */
export async function transcribeWithChunking(
  blob: Blob,
  onProgress?: (progress: ChunkProgress) => void
): Promise<ChunkResult> {
  const fileSize = blob.size;
  
  console.log(`[audioChunking] Transcribing blob: ${(fileSize / (1024 * 1024)).toFixed(2)}MB`);
  
  onProgress?.({ currentChunk: 1, totalChunks: 1, phase: 'transcribing' });
  
  // Send the entire blob to the edge function
  // The edge function uses ElevenLabs for files >25MB
  const result = await transcribeSingleBlob(blob);
  
  onProgress?.({ currentChunk: 1, totalChunks: 1, phase: 'complete' });
  
  return {
    transcript: result.transcript,
    service: result.service,
    chunked: false,
    totalChunks: 1
  };
}

/**
 * Transcribe a single blob using the transcribe-audio edge function.
 */
async function transcribeSingleBlob(
  blob: Blob
): Promise<{ transcript: string; service: 'whisper' | 'elevenlabs' }> {
  const formData = new FormData();
  formData.append('audio', blob, 'audio.webm');
  
  const response = await supabase.functions.invoke('transcribe-audio', {
    body: formData,
  });
  
  if (response.error) {
    throw new Error(response.error.message || 'Transcription failed');
  }
  
  const transcript = response.data?.transcript;
  if (!transcript) {
    throw new Error('No transcript returned');
  }
  
  return {
    transcript,
    service: response.data?.service || 'whisper'
  };
}
