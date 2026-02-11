import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, Pencil, Type, Mic, Loader2, ChevronDown, Eye } from 'lucide-react';
import { AudioRecorder } from '@/components/coach/AudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BaselineCompleteProps {
  onFinish: () => void;
  assessmentId: string | null;
  existingReflection?: {
    original: string | null;
    formatted: string | null;
    mode: string | null;
    submittedAt: string | null;
  } | null;
}

const REFLECTION_PROMPTS = [
  "What was this like to complete?",
  "What thoughts came up while you did it?",
  "What did you notice?",
  "What stood out?",
];

export function BaselineComplete({ onFinish, assessmentId, existingReflection }: BaselineCompleteProps) {
  const { toast } = useToast();
  const [reflectionText, setReflectionText] = useState(existingReflection?.original || '');
  const [reflectionMode, setReflectionMode] = useState<'typed' | 'voice'>('typed');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [submittedReflection, setSubmittedReflection] = useState(existingReflection?.formatted ? {
    original: existingReflection.original || '',
    formatted: existingReflection.formatted,
  } : null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Format + save reflection
  const submitReflectionMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!assessmentId) throw new Error('No assessment ID');

      // Call format-reflection edge function
      const { data: formatData, error: formatError } = await supabase.functions.invoke('format-reflection', {
        body: { text },
      });

      if (formatError) throw formatError;

      const formatted = formatData?.formatted || text;

      // Save to database
      const { error } = await supabase
        .from('doctor_baseline_assessments')
        .update({
          reflection_original: text,
          reflection_formatted: formatted,
          reflection_mode: reflectionMode,
          reflection_submitted_at: new Date().toISOString(),
        })
        .eq('id', assessmentId);

      if (error) throw error;
      return { original: text, formatted };
    },
    onSuccess: (data) => {
      setSubmittedReflection(data);
      setIsEditing(false);
      toast({ title: 'Reflection saved' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving reflection',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle voice recording complete → transcribe
  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'reflection.webm');

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });

      if (error) throw error;
      const transcript = data?.transcript || data?.text || '';
      setReflectionText(transcript);
      setReflectionMode('voice');
      toast({ title: 'Transcription complete', description: 'Review and edit the transcript below.' });
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: 'Transcription failed',
        description: 'Please try again or type your reflection instead.',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSubmitReflection = () => {
    if (!reflectionText.trim()) return;
    submitReflectionMutation.mutate(reflectionText.trim());
  };

  const handleEdit = () => {
    setReflectionText(submittedReflection?.original || '');
    setIsEditing(true);
    setSubmittedReflection(null);
  };

  const isSubmitting = submitReflectionMutation.isPending;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Success Card */}
      <Card className="text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-green-100 rounded-full">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Baseline Complete!</CardTitle>
          <CardDescription className="text-base mt-2">
            Your self-assessment has been submitted successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">What happens next?</h3>
            <p className="text-sm text-muted-foreground">
              Dr. Alex will reach out to schedule your baseline check-in conversation. 
              This is a collaborative discussion to align on your development priorities 
              and create a plan for your professional growth.
            </p>
          </div>

          <Button onClick={onFinish} className="w-full" size="lg">
            Go to Home
          </Button>
        </CardContent>
      </Card>

      {/* Reflection Card */}
      <Card>
        <Collapsible defaultOpen={!submittedReflection}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="text-left">
                <CardTitle className="text-lg">Reflection (optional)</CardTitle>
                <CardDescription className="mt-1">
                  Take a moment to capture your thoughts — this helps your coaching conversation.
                </CardDescription>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform" />
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Guiding prompts */}
              <div className="space-y-1 text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3">
                {REFLECTION_PROMPTS.map((prompt, i) => (
                  <p key={i}>{prompt}</p>
                ))}
              </div>

              {/* Submitted state */}
              {submittedReflection && !isEditing ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm whitespace-pre-wrap">
                      {showOriginal ? submittedReflection.original : submittedReflection.formatted}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowOriginal(!showOriginal)}
                      className="text-xs gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      {showOriginal ? 'Show formatted' : 'View original'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEdit}
                      className="text-xs gap-1"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </div>
                </div>
              ) : (
                /* Input state */
                <div className="space-y-4">
                  <Tabs
                    defaultValue="type"
                    onValueChange={(v) => setReflectionMode(v as 'typed' | 'voice')}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="type" className="flex-1 gap-2">
                        <Type className="h-4 w-4" />
                        Type
                      </TabsTrigger>
                      <TabsTrigger value="voice" className="flex-1 gap-2">
                        <Mic className="h-4 w-4" />
                        Record
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="type" className="mt-3">
                      <Textarea
                        placeholder="Share your thoughts..."
                        value={reflectionText}
                        onChange={(e) => {
                          setReflectionText(e.target.value);
                          setReflectionMode('typed');
                        }}
                        rows={4}
                        className="min-h-[100px]"
                      />
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        {reflectionText.length} characters
                      </p>
                    </TabsContent>

                    <TabsContent value="voice" className="mt-3 space-y-3">
                      {isTranscribing ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Transcribing your recording...
                        </div>
                      ) : (
                        <AudioRecorder
                          onRecordingComplete={handleRecordingComplete}
                          disabled={isSubmitting}
                        />
                      )}
                      {reflectionText && reflectionMode === 'voice' && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Transcript (editable):</p>
                          <Textarea
                            value={reflectionText}
                            onChange={(e) => setReflectionText(e.target.value)}
                            rows={4}
                            className="min-h-[100px]"
                          />
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <Button
                    onClick={handleSubmitReflection}
                    disabled={!reflectionText.trim() || isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Submit Reflection
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
