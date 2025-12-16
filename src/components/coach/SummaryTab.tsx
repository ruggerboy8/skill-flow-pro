import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Mic, FileText } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface SummaryTabProps {
  evalId: string;
  staffName: string;
  summaryFeedback: string | null;
  summaryRawTranscript: string | null;
  isReadOnly: boolean;
  onFeedbackChange: (feedback: string) => void;
  onTranscriptChange: (transcript: string) => void;
}

export function SummaryTab({
  evalId,
  staffName,
  summaryFeedback,
  summaryRawTranscript,
  isReadOnly,
  onFeedbackChange,
  onTranscriptChange,
}: SummaryTabProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [localFeedback, setLocalFeedback] = useState(summaryFeedback || '');
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    setLocalFeedback(summaryFeedback || '');
  }, [summaryFeedback]);

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

      // Save raw transcript
      onTranscriptChange(transcript);

      // Step 2: Format the transcript using Lovable AI
      setProcessingStep('Formatting feedback...');

      const parseResponse = await supabase.functions.invoke('parse-feedback', {
        body: { transcript, staffName },
      });

      if (parseResponse.error) {
        throw new Error(parseResponse.error.message || 'Formatting failed');
      }

      const formattedFeedback = parseResponse.data?.formattedFeedback;
      if (!formattedFeedback) {
        throw new Error('No formatted feedback returned');
      }

      // Update local state and parent
      setLocalFeedback(formattedFeedback);
      onFeedbackChange(formattedFeedback);

      toast({
        title: 'Success',
        description: 'Audio transcribed and formatted successfully',
      });
    } catch (error) {
      console.error('[SummaryTab] Processing error:', error);
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

  const handleFeedbackChange = (value: string) => {
    setLocalFeedback(value);
  };

  const handleFeedbackBlur = () => {
    onFeedbackChange(localFeedback);
  };

  // Quill toolbar options
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['clean']
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline',
    'list', 'bullet'
  ];

  return (
    <div className="space-y-6">
      {/* Audio Recording Section */}
      {!isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mic className="w-5 h-5" />
              Record Overall Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Record your overall feedback about this staff member. The audio will be transcribed 
              and formatted into a professional feedback document that you can review and edit.
            </p>
            
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
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Formatted Feedback Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Overall Feedback
            {localFeedback && !isReadOnly && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (You can edit this text)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isReadOnly ? (
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: localFeedback || '<p class="text-muted-foreground italic">No summary feedback provided.</p>' }}
            />
          ) : (
            <div className="space-y-4">
              <ReactQuill
                theme="snow"
                value={localFeedback}
                onChange={handleFeedbackChange}
                onBlur={handleFeedbackBlur}
                modules={modules}
                formats={formats}
                placeholder="Enter your overall feedback here, or record audio above to generate it automatically..."
                className="bg-background"
              />
              {!localFeedback && (
                <p className="text-xs text-muted-foreground">
                  Tip: Record your verbal feedback above, and it will be automatically transcribed and formatted here.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw Transcript (collapsed by default) */}
      {summaryRawTranscript && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowTranscript(!showTranscript)}>
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Sparkles className="w-4 h-4" />
              {showTranscript ? 'Hide' : 'Show'} Original Transcript
            </CardTitle>
          </CardHeader>
          {showTranscript && (
            <CardContent>
              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap">
                {summaryRawTranscript}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
