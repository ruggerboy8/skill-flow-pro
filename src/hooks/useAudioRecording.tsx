import { useState, useRef, useEffect, useCallback } from 'react';

// Segment at ~20MB to stay well under Whisper's 25MB limit
const SEGMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export interface AudioSegment {
  blob: Blob;
  index: number;
  timestamp: number;
}

export interface AudioRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  previewUrl: string | null;
  // Segmentation state
  currentSegmentIndex: number;
  segments: AudioSegment[];
  estimatedSize: number; // Approximate current segment size in bytes
}

export interface AudioRecordingControls {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  stopAndGetBlob: () => Promise<Blob | null>;
  togglePause: () => void;
  resetRecording: () => void;
}

export interface UseAudioRecordingOptions {
  /** Called when a segment is ready to be uploaded (for large recordings) */
  onSegmentReady?: (segment: AudioSegment) => Promise<void>;
  /** Enable automatic segmentation at ~20MB boundaries */
  enableSegmentation?: boolean;
}

export function useAudioRecording(options: UseAudioRecordingOptions = {}) {
  const { onSegmentReady, enableSegmentation = false } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [estimatedSize, setEstimatedSize] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentSegmentSizeRef = useRef(0);
  const segmentIndexRef = useRef(0);
  const allSegmentsRef = useRef<AudioSegment[]>([]);
  const isSegmentingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Generate preview URL when paused
  useEffect(() => {
    if (isPaused && audioChunksRef.current.length > 0) {
      const previewBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(previewBlob);
      setPreviewUrl(url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [isPaused]);

  // Helper to finalize current segment and start a new one
  const finalizeCurrentSegment = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;
    if (isSegmentingRef.current) return; // Prevent re-entry
    
    isSegmentingRef.current = true;
    
    try {
      const segmentBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const segment: AudioSegment = {
        blob: segmentBlob,
        index: segmentIndexRef.current,
        timestamp: Date.now(),
      };
      
      console.log(`[useAudioRecording] Segment ${segment.index} complete: ${(segmentBlob.size / (1024 * 1024)).toFixed(2)}MB`);
      
      // Store segment
      allSegmentsRef.current.push(segment);
      setSegments([...allSegmentsRef.current]);
      
      // Notify caller to upload segment
      if (onSegmentReady) {
        await onSegmentReady(segment);
      }
      
      // Reset for next segment
      audioChunksRef.current = [];
      currentSegmentSizeRef.current = 0;
      segmentIndexRef.current++;
      setCurrentSegmentIndex(segmentIndexRef.current);
      setEstimatedSize(0);
    } finally {
      isSegmentingRef.current = false;
    }
  }, [onSegmentReady]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      currentSegmentSizeRef.current = 0;
      segmentIndexRef.current = 0;
      allSegmentsRef.current = [];
      setSegments([]);
      setCurrentSegmentIndex(0);
      setEstimatedSize(0);

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          currentSegmentSizeRef.current += event.data.size;
          setEstimatedSize(currentSegmentSizeRef.current);
          
          // Check if we should segment (only when segmentation is enabled)
          if (enableSegmentation && currentSegmentSizeRef.current >= SEGMENT_SIZE_BYTES) {
            console.log('[useAudioRecording] Segment size threshold reached, finalizing segment...');
            
            // We need to stop, save segment, and restart MediaRecorder
            // But we can't do this inside ondataavailable synchronously
            // Instead, we'll use requestStop and handle it in onstop
            // For now, we'll finalize the segment asynchronously
            await finalizeCurrentSegment();
          }
        }
      };

      mediaRecorder.onstop = () => {
        // Create final blob from remaining chunks
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // If we have segments, this is the final segment
        if (allSegmentsRef.current.length > 0 && audioChunksRef.current.length > 0) {
          const finalSegment: AudioSegment = {
            blob,
            index: segmentIndexRef.current,
            timestamp: Date.now(),
          };
          allSegmentsRef.current.push(finalSegment);
          setSegments([...allSegmentsRef.current]);
          console.log(`[useAudioRecording] Final segment ${finalSegment.index} complete: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);
        }
        
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [enableSegmentation, finalizeCurrentSegment]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setPreviewUrl(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Stop and return blob directly - useful for immediate processing
  const stopAndGetBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;
      
      // Override onstop to resolve the promise
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Handle final segment if we have prior segments
        if (allSegmentsRef.current.length > 0 && audioChunksRef.current.length > 0) {
          const finalSegment: AudioSegment = {
            blob,
            index: segmentIndexRef.current,
            timestamp: Date.now(),
          };
          allSegmentsRef.current.push(finalSegment);
          setSegments([...allSegmentsRef.current]);
        }
        
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        resolve(blob);
      };

      mediaRecorder.stop();
      setIsRecording(false);
      setIsPaused(false);
      setPreviewUrl(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });
  }, [isRecording]);

  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, isPaused]);

  const resetRecording = useCallback(() => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordingTime(0);
    setIsRecording(false);
    setIsPaused(false);
    setCurrentSegmentIndex(0);
    setSegments([]);
    setEstimatedSize(0);
    allSegmentsRef.current = [];
    segmentIndexRef.current = 0;
    currentSegmentSizeRef.current = 0;
  }, [audioUrl, previewUrl]);

  const state: AudioRecordingState = {
    isRecording,
    isPaused,
    recordingTime,
    audioBlob,
    audioUrl,
    previewUrl,
    currentSegmentIndex,
    segments,
    estimatedSize,
  };

  const controls: AudioRecordingControls = {
    startRecording,
    stopRecording,
    stopAndGetBlob,
    togglePause,
    resetRecording,
  };

  return { state, controls };
}
