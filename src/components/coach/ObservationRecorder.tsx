import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mic } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { updateExtractedInsights } from '@/lib/evaluations';
import type { AudioRecordingState, AudioRecordingControls } from '@/hooks/useAudioRecording';
import type { ExtractedInsights, InsightsPerspective } from '@/lib/evaluations';

interface ObservationRecorderProps {
  evalId: string;
  staffName: string;
  onFeedbackGenerated: (feedback: string, transcript: string, insights?: InsightsPerspective) => void;
  recordingState: AudioRecordingState;
  recordingControls: AudioRecordingControls;
  currentInsights?: ExtractedInsights | null;
}

export function ObservationRecorder({
  evalId,
  staffName,
  onFeedbackGenerated,
  recordingState,
  recordingControls,
  currentInsights,
}: ObservationRecorderProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setProcessingStep('Transcribing audio...');

    try {
      // Step 1: Transcribe audio using OpenAI Whisper
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcribeResponse = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });

      if (transcribeResponse.error) {
        throw new Error(transcribeResponse.error.message || 'Transcription failed');
      }

      const transcript = transcribeResponse.data?.transcript;
      if (!transcript) {
        throw new Error('No transcript returned');
      }

      // Step 2: Extract insights using extract-insights with source='observation'
      setProcessingStep('Extracting insights...');

      const extractResponse = await supabase.functions.invoke('extract-insights', {
        body: { transcript, staffName, source: 'observation' },
      });

      if (extractResponse.error) {
        throw new Error(extractResponse.error.message || 'Insight extraction failed');
      }

      const insights = extractResponse.data?.insights as InsightsPerspective;
      if (!insights) {
        throw new Error('No insights returned');
      }

      // Step 3: Save to database - merge with existing insights
      const updatedInsights: ExtractedInsights = {
        ...currentInsights,
        observer: insights
      };
      
      await updateExtractedInsights(evalId, updatedInsights);

      // Pass feedback and insights up to parent
      // Use summary_html as the formatted feedback for backwards compatibility
      onFeedbackGenerated(insights.summary_html || '', transcript, insights);

      // Reset recording state after successful processing
      recordingControls.resetRecording();

      toast({
        title: 'Success',
        description: 'Observations transcribed and analyzed successfully',
      });
    } catch (error) {
      console.error('[ObservationRecorder] Processing error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process audio',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const isRecordingInProgress = recordingState?.isRecording || false;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Record Your Observations
          {isRecordingInProgress && (
            <span className="ml-2 flex items-center gap-1 text-sm font-normal text-red-500">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording in progress
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          After completing your competency scores below, record your overall thoughts. Speak naturally—our system 
          will analyze your feedback and organize it by domain.
        </p>
        
        <div className="mb-4 space-y-3">
          <p className="text-sm font-medium">What to cover:</p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside ml-2">
            <li><strong>The "Big Picture":</strong> How are they doing generally?</li>
            <li><strong>Nuance on the Scores:</strong> Explain specific behaviors behind your ratings.</li>
            <li><strong>Encouragement:</strong> End with a forward-looking statement.</li>
          </ul>
        </div>
        
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Stuck? Try these starters:</p>
          <ul className="text-sm text-muted-foreground space-y-1 italic">
            <li>"I want to highlight how well you handled..."</li>
            <li>"Regarding the [Clinical/Clerical] score, what I really meant was..."</li>
            <li>"A specific example of where I see room for growth is..."</li>
            <li>"Overall, I really appreciate that you..."</li>
          </ul>
        </div>
        
        {isProcessing ? (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">{processingStep}</p>
              <p className="text-sm text-muted-foreground">This may take a moment...</p>
            </div>
          </div>
        ) : (
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={isProcessing}
            externalState={recordingState}
            externalControls={recordingControls}
          />
        )}
      </CardContent>
    </Card>
  );
}
