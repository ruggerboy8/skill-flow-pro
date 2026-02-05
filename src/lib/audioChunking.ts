/**
 * Audio Chunking Utilities for Large File Transcription
 * 
 * Handles chunking of audio blobs at ~20MB boundaries to stay under
 * Whisper's 25MB limit, and concatenates the resulting transcripts.
 */

import { supabase } from '@/integrations/supabase/client';

// Chunk at ~20MB to stay well under Whisper's 25MB limit
export const CHUNK_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

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
 * Transcribe an audio blob, automatically chunking if > 20MB
 * and concatenating the resulting transcripts.
 * 
 * @param blob - The audio blob to transcribe
 * @param onProgress - Optional callback for progress updates
 * @returns Combined transcript and metadata
 */
export async function transcribeWithChunking(
  blob: Blob,
  onProgress?: (progress: ChunkProgress) => void
): Promise<ChunkResult> {
  const fileSize = blob.size;
  
  console.log(`[audioChunking] Transcribing blob: ${(fileSize / (1024 * 1024)).toFixed(2)}MB`);
  
  // If file is under chunk threshold, use single transcription
  if (fileSize <= CHUNK_SIZE_BYTES) {
    onProgress?.({ currentChunk: 1, totalChunks: 1, phase: 'transcribing' });
    
    const result = await transcribeSingleBlob(blob);
    
    onProgress?.({ currentChunk: 1, totalChunks: 1, phase: 'complete' });
    
    return {
      transcript: result.transcript,
      service: result.service,
      chunked: false,
      totalChunks: 1
    };
  }
  
  // Large file: chunk and transcribe in parallel
  const chunks = chunkBlob(blob);
  const totalChunks = chunks.length;
  
  console.log(`[audioChunking] File exceeds ${CHUNK_SIZE_BYTES / (1024 * 1024)}MB, splitting into ${totalChunks} chunks`);
  
  onProgress?.({ currentChunk: 0, totalChunks, phase: 'chunking' });
  
  // Transcribe all chunks in parallel
  const transcriptPromises = chunks.map(async (chunk, index) => {
    console.log(`[audioChunking] Transcribing chunk ${index + 1}/${totalChunks}: ${(chunk.size / (1024 * 1024)).toFixed(2)}MB`);
    
    try {
      const result = await transcribeSingleBlob(chunk);
      onProgress?.({ currentChunk: index + 1, totalChunks, phase: 'transcribing' });
      return { index, transcript: result.transcript, service: result.service };
    } catch (error) {
      console.error(`[audioChunking] Chunk ${index + 1} failed:`, error);
      // Return empty transcript for failed chunk to maintain order
      return { index, transcript: '', service: 'whisper' as const };
    }
  });
  
  const results = await Promise.all(transcriptPromises);
  
  // Sort by index and concatenate transcripts
  results.sort((a, b) => a.index - b.index);
  const fullTranscript = results
    .map(r => r.transcript)
    .filter(Boolean)
    .join(' ');
  
  // Use the service from the first successful result
  const service = results.find(r => r.transcript)?.service || 'whisper';
  
  onProgress?.({ currentChunk: totalChunks, totalChunks, phase: 'complete' });
  
  console.log(`[audioChunking] Transcription complete. Total length: ${fullTranscript.length} chars`);
  
  return {
    transcript: fullTranscript,
    service,
    chunked: true,
    totalChunks
  };
}

/**
 * Split a blob into chunks at approximately CHUNK_SIZE_BYTES boundaries.
 * Note: This does byte-level splitting which can cause minor audio artifacts
 * at chunk boundaries, but is acceptable for speech transcription.
 */
function chunkBlob(blob: Blob): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, blob.size);
    chunks.push(blob.slice(offset, end, blob.type));
    offset = end;
  }
  
  return chunks;
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
