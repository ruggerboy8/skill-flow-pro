import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { Loader2, Mic, Square, Sparkles, Volume2, AlertCircle } from 'lucide-react';

interface AIContentAssistantProps {
  proMoveStatement: string;
  onGenerated: (content: Record<string, string>) => void;
}

type ProcessingStep = 'idle' | 'recording' | 'transcribing' | 'generating';

export function AIContentAssistant({ proMoveStatement, onGenerated }: AIContentAssistantProps) {
  const [rawInput, setRawInput] = useState('');
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const { state: recordingState, controls } = useAudioRecording();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    setError(null);
    try {
      await controls.startRecording();
      setProcessingStep('recording');
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Could not access microphone. Please check your permissions.');
    }
  };

  const handleStopRecording = async () => {
    setProcessingStep('transcribing');
    try {
      const audioBlob = await controls.stopAndGetBlob();
      if (!audioBlob) {
        throw new Error('No audio recorded');
      }

      // Send as FormData (matching other callers)
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Transcribe audio
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });

      if (transcribeError) throw transcribeError;
      if (!transcribeData?.transcript) throw new Error('No transcript returned');

      setRawInput(transcribeData.transcript);
      setProcessingStep('idle');
      
      toast({
        title: 'Transcription Complete',
        description: 'Your voice input has been transcribed. Click "Generate Content" to continue.',
      });
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe audio. Please try again or type your input.');
      setProcessingStep('idle');
    }
  };

  const handleGenerate = async () => {
    if (!rawInput.trim()) {
      setError('Please provide some input first.');
      return;
    }

    setError(null);
    setProcessingStep('generating');
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('categorize-doctor-content', {
        body: {
          proMoveStatement,
          rawInput: rawInput.trim(),
        }
      });

      if (fnError) throw fnError;
      
      if (!data?.doctor_why && !data?.doctor_script && !data?.doctor_gut_check && !data?.doctor_good_looks_like) {
        throw new Error('AI did not generate valid content');
      }

      onGenerated(data);
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err?.message || 'Failed to generate content. Please try again.');
      setProcessingStep('idle');
    }
  };

  const isProcessing = processingStep !== 'idle' && processingStep !== 'recording';

  return (
    <Card className="border-dashed border-warning bg-warning/10">
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-2">
          <Label>Describe what you want doctors to understand about this Pro Move</Label>
          <p className="text-xs text-muted-foreground">
            Speak or type freely about why it matters, example scripts, gut check questions, and what good looks like. 
            The AI will organize your input into the four required categories.
          </p>
        </div>

        {/* Text Input */}
        <Textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="For example: 'The reason this matters is accurate baseline documentation. When with a patient, say things like Calling out existing crown on A. The key gut check is: Did I verbally announce all findings? Good looks like having the chart complete before documenting new disease...'"
          rows={6}
          disabled={isProcessing || processingStep === 'recording'}
          className="bg-background"
        />

        {/* Voice Recording */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">OR</span>
          
          {processingStep === 'recording' ? (
            <div className="flex items-center gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopRecording}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>
              <span className="flex items-center gap-2 text-sm text-destructive">
                <Volume2 className="h-4 w-4 animate-pulse" />
                {formatTime(recordingState.recordingTime)}
              </span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartRecording}
              disabled={isProcessing}
            >
              <Mic className="h-4 w-4 mr-2" />
              Record Voice
            </Button>
          )}

          {processingStep === 'transcribing' && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Transcribing...
            </span>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!rawInput.trim() || isProcessing}
          className="w-full"
        >
          {processingStep === 'generating' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Content...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Content
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
