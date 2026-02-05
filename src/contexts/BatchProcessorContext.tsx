import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PendingEval {
  id: string;
  staffName: string;
  locationName: string;
  period: string;
  audioPath: string | null;
  audioSize: number | null;
  hasTranscript: boolean;
  hasInsights: boolean;
  existingTranscript: string | null;
  issue: 'no_transcript' | 'no_insights';
  status: 'pending' | 'processing' | 'success' | 'skipped' | 'error';
  message?: string;
}

interface BatchProcessorState {
  isProcessing: boolean;
  isStopping: boolean;
  pendingEvals: PendingEval[];
  currentIndex: number;
}

interface BatchProcessorContextType {
  state: BatchProcessorState;
  setPendingEvals: (evals: PendingEval[]) => void;
  startProcessing: () => Promise<void>;
  stopProcessing: () => void;
  resetState: () => void;
}

const BatchProcessorContext = createContext<BatchProcessorContextType | null>(null);

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DELAY_BETWEEN_ITEMS_MS = 1000;

export function BatchProcessorProvider({ children }: { children: ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [pendingEvals, setPendingEvals] = useState<PendingEval[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Warn user before leaving page while processing
  useEffect(() => {
    if (!isProcessing) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Processing is in progress. Are you sure you want to leave?';
      return e.returnValue;
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  function stopProcessing() {
    setIsStopping(true);
    abortControllerRef.current?.abort();
  }

  function resetState() {
    setPendingEvals([]);
    setCurrentIndex(0);
    setIsProcessing(false);
    setIsStopping(false);
  }

  async function processOne(evalItem: PendingEval): Promise<{ 
    status: 'success' | 'skipped' | 'error'; 
    message?: string;
    audioSize?: number;
  }> {
    try {
      let transcript = evalItem.existingTranscript;

      // Step 1: Transcription if needed
      if (evalItem.issue === 'no_transcript' && evalItem.audioPath) {
        // Download audio from storage
        const { data: audioData, error: downloadError } = await supabase.storage
          .from('evaluation-audio')
          .download(evalItem.audioPath);

        if (downloadError) {
          return { status: 'error', message: `Download failed: ${downloadError.message}` };
        }

        const audioBlob = audioData;
        
        // Check file size
        if (audioBlob.size > MAX_FILE_SIZE) {
          return { status: 'skipped', message: 'Audio file too large (>25MB)', audioSize: audioBlob.size };
        }

        // Send to transcribe-audio - use correct filename extension from path
        const formData = new FormData();
        const fileName = evalItem.audioPath.split('/').pop() || 'audio.webm';
        formData.append('audio', audioBlob, fileName);

        const { data: transcriptResult, error: transcribeError } = await supabase.functions
          .invoke('transcribe-audio', { body: formData });

        if (transcribeError) {
          return { status: 'error', message: `Transcription failed: ${transcribeError.message}` };
        }

        transcript = transcriptResult?.text || transcriptResult?.transcript;

        if (!transcript) {
          return { status: 'error', message: 'No transcript returned' };
        }

        // Save transcript
        const { error: updateError } = await supabase
          .from('evaluations')
          .update({ summary_raw_transcript: transcript })
          .eq('id', evalItem.id);

        if (updateError) {
          return { status: 'error', message: `Failed to save transcript: ${updateError.message}` };
        }
      }

      // Step 2: Extract insights
      if (transcript) {
        // Get evaluation items for this evaluation
        const { data: evalItemsData, error: itemsError } = await supabase
          .from('evaluation_items')
          .select('competency_id, competency_name_snapshot')
          .eq('evaluation_id', evalItem.id);

        if (itemsError) {
          return { status: 'error', message: `Failed to fetch eval items: ${itemsError.message}` };
        }

        const competencyNames = evalItemsData?.map(item => 
          item.competency_name_snapshot
        ).filter(Boolean) || [];

        const { data: insightsResult, error: insightsError } = await supabase.functions
          .invoke('extract-insights', {
            body: {
              transcript,
              competencies: competencyNames,
              evaluationId: evalItem.id
            }
          });

        if (insightsError) {
          return { status: 'error', message: `Insights extraction failed: ${insightsError.message}` };
        }

        // Save insights
        const { error: saveInsightsError } = await supabase
          .from('evaluations')
          .update({ extracted_insights: insightsResult })
          .eq('id', evalItem.id);

        if (saveInsightsError) {
          return { status: 'error', message: `Failed to save insights: ${saveInsightsError.message}` };
        }
      }

      return { status: 'success' };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async function startProcessing() {
    const itemsToProcess = pendingEvals.filter(e => e.status === 'pending');
    if (itemsToProcess.length === 0) return;

    setIsProcessing(true);
    setIsStopping(false);
    abortControllerRef.current = new AbortController();

    for (let i = 0; i < pendingEvals.length; i++) {
      // Check if we should stop
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      const evalItem = pendingEvals[i];
      if (evalItem.status !== 'pending') continue;

      setCurrentIndex(i);
      
      // Update status to processing
      setPendingEvals(prev => prev.map((e, idx) => 
        idx === i ? { ...e, status: 'processing' as const } : e
      ));

      const result = await processOne(evalItem);

      // Update with result
      setPendingEvals(prev => prev.map((e, idx) => 
        idx === i ? { ...e, status: result.status, message: result.message } : e
      ));

      // Delay before next item (unless stopped or last item)
      if (i < pendingEvals.length - 1 && !abortControllerRef.current?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITEMS_MS));
      }
    }

    setIsProcessing(false);
    setIsStopping(false);
    
    const successCount = pendingEvals.filter(e => e.status === 'success').length;
    const errorCount = pendingEvals.filter(e => e.status === 'error').length;
    
    if (abortControllerRef.current?.signal.aborted) {
      toast.info('Processing stopped');
    } else if (errorCount > 0) {
      toast.warning(`Completed with ${errorCount} error(s)`);
    } else {
      toast.success(`Successfully processed ${successCount} evaluation(s)`);
    }
  }

  return (
    <BatchProcessorContext.Provider value={{
      state: { isProcessing, isStopping, pendingEvals, currentIndex },
      setPendingEvals,
      startProcessing,
      stopProcessing,
      resetState,
    }}>
      {children}
    </BatchProcessorContext.Provider>
  );
}

export function useBatchProcessor() {
  const context = useContext(BatchProcessorContext);
  if (!context) {
    throw new Error('useBatchProcessor must be used within BatchProcessorProvider');
  }
  return context;
}
