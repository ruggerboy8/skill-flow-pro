import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mic, ChevronDown, Search, Play, Check, AlertTriangle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface PendingEval {
  id: string;
  staffName: string;
  locationName: string;
  period: string; // e.g., "Q1 2025", "Baseline"
  audioPath: string | null;
  audioSize: number | null;
  hasTranscript: boolean;
  hasInsights: boolean;
  existingTranscript: string | null;
  issue: 'no_transcript' | 'no_insights';
  status: 'pending' | 'processing' | 'success' | 'skipped' | 'error';
  message?: string;
}

function formatPeriod(type: string, quarter: string | null, year: number): string {
  if (type === 'Baseline') return 'Baseline';
  return quarter ? `${quarter} ${year}` : `${year}`;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function BatchTranscriptProcessor() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingEvals, setPendingEvals] = useState<PendingEval[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const missingTranscriptCount = pendingEvals.filter(e => e.issue === 'no_transcript').length;
  const missingInsightsCount = pendingEvals.filter(e => e.issue === 'no_insights').length;
  const completedCount = pendingEvals.filter(e => e.status === 'success' || e.status === 'skipped' || e.status === 'error').length;

  async function scanForMissing() {
    setIsScanning(true);
    setPendingEvals([]);

    try {
      // Query for evaluations needing transcription or insight extraction
      // Don't use embedded relations since location_id FK isn't in schema cache
      const { data, error } = await supabase
        .from('evaluations')
        .select(`
          id,
          audio_recording_path,
          summary_raw_transcript,
          extracted_insights,
          staff_id,
          location_id,
          type,
          quarter,
          program_year
        `)
        .or('and(audio_recording_path.not.is.null,summary_raw_transcript.is.null),and(summary_raw_transcript.not.is.null,extracted_insights.is.null)');

      if (error) throw error;

      if (!data || data.length === 0) {
        setPendingEvals([]);
        toast.info('All evaluations are up to date');
        return;
      }

      // Get unique staff and location IDs
      const staffIds = [...new Set(data.map(d => d.staff_id))];
      const locationIds = [...new Set(data.map(d => d.location_id))];

      // Fetch staff names
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name')
        .in('id', staffIds);
      const staffMap = new Map((staffData || []).map(s => [s.id, s.name]));

      // Fetch location names
      const { data: locationData } = await supabase
        .from('locations')
        .select('id, name')
        .in('id', locationIds);
      const locationMap = new Map((locationData || []).map(l => [l.id, l.name]));

      const evals: PendingEval[] = [];

      for (const row of data) {
        const staffName = staffMap.get(row.staff_id) || 'Unknown';
        const locationName = locationMap.get(row.location_id) || 'Unknown';

        const period = formatPeriod(row.type, row.quarter, row.program_year);

        // Determine issue type
        if (row.audio_recording_path && !row.summary_raw_transcript) {
          evals.push({
            id: row.id,
            staffName,
            locationName,
            period,
            audioPath: row.audio_recording_path,
            audioSize: null,
            hasTranscript: false,
            hasInsights: false,
            existingTranscript: null,
            issue: 'no_transcript',
            status: 'pending',
          });
        } else if (row.summary_raw_transcript && !row.extracted_insights) {
          evals.push({
            id: row.id,
            staffName,
            locationName,
            period,
            audioPath: row.audio_recording_path,
            audioSize: null,
            hasTranscript: true,
            hasInsights: false,
            existingTranscript: row.summary_raw_transcript,
            issue: 'no_insights',
            status: 'pending',
          });
        }
      }

      setPendingEvals(evals);
      
      if (evals.length === 0) {
        toast.info('All evaluations are up to date');
      } else {
        toast.success(`Found ${evals.length} evaluation(s) needing processing`);
      }
    } catch (err) {
      console.error('Scan error:', err);
      toast.error('Failed to scan for missing transcripts/insights');
    } finally {
      setIsScanning(false);
    }
  }

  async function processAll() {
    if (pendingEvals.length === 0) return;

    setIsProcessing(true);
    setCurrentIndex(0);

    const pendingItems = pendingEvals.filter(e => e.status === 'pending');

    for (let i = 0; i < pendingItems.length; i++) {
      const evalItem = pendingItems[i];
      setCurrentIndex(i);

      // Update status to processing
      setPendingEvals(prev => prev.map(e => 
        e.id === evalItem.id ? { ...e, status: 'processing' } : e
      ));

      try {
        const result = await processOne(evalItem);
        setPendingEvals(prev => prev.map(e => 
          e.id === evalItem.id ? { ...e, ...result } : e
        ));
      } catch (err) {
        console.error('Process error:', err);
        setPendingEvals(prev => prev.map(e => 
          e.id === evalItem.id ? { ...e, status: 'error', message: 'Unexpected error' } : e
        ));
      }
    }

    setIsProcessing(false);
    
    const results = pendingEvals;
    const successCount = results.filter(e => e.status === 'success').length;
    const skippedCount = results.filter(e => e.status === 'skipped').length;
    const errorCount = results.filter(e => e.status === 'error').length;

    toast.success(`Processing complete: ${successCount} succeeded, ${skippedCount} skipped, ${errorCount} errors`);
  }

  async function processOne(evalItem: PendingEval): Promise<Partial<PendingEval>> {
    let transcript = evalItem.existingTranscript;

    // Stage 1: Transcription (if needed)
    if (evalItem.issue === 'no_transcript' && evalItem.audioPath) {
      try {
        // Download audio file
        const { data: audioBlob, error: downloadError } = await supabase.storage
          .from('evaluation-audio')
          .download(evalItem.audioPath);

        if (downloadError || !audioBlob) {
          return { status: 'error', message: 'Failed to download audio' };
        }

        // Check file size
        if (audioBlob.size > MAX_FILE_SIZE) {
          return { status: 'skipped', message: 'Audio file too large (>25MB)', audioSize: audioBlob.size };
        }

        // Send to transcribe-audio
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');

        const { data: transcriptResult, error: transcribeError } = await supabase.functions
          .invoke('transcribe-audio', { body: formData });

        if (transcribeError || !transcriptResult?.transcript) {
          return { status: 'error', message: transcribeError?.message || 'Transcription failed' };
        }

        transcript = transcriptResult.transcript;

        // Save transcript
        const { error: updateError } = await supabase
          .from('evaluations')
          .update({ summary_raw_transcript: transcript })
          .eq('id', evalItem.id);

        if (updateError) {
          return { status: 'error', message: 'Failed to save transcript' };
        }
      } catch (err) {
        console.error('Transcription error:', err);
        return { status: 'error', message: 'Transcription failed' };
      }
    }

    // Stage 2: Insight Extraction
    if (transcript) {
      try {
        const { data: insightsResult, error: insightsError } = await supabase.functions
          .invoke('extract-insights', {
            body: {
              transcript,
              staffName: evalItem.staffName,
              source: 'observation'
            }
          });

        if (insightsError || !insightsResult?.insights) {
          return { status: 'error', message: insightsError?.message || 'Insight extraction failed' };
        }

        // Save insights
        const insights = { observer: insightsResult.insights };
        const { error: updateError } = await supabase
          .from('evaluations')
          .update({ extracted_insights: insights })
          .eq('id', evalItem.id);

        if (updateError) {
          return { status: 'error', message: 'Failed to save insights' };
        }

        return { status: 'success', message: 'Completed' };
      } catch (err) {
        console.error('Insight extraction error:', err);
        return { status: 'error', message: 'Insight extraction failed' };
      }
    }

    return { status: 'error', message: 'No transcript available' };
  }

  function formatFileSize(bytes: number | null): string {
    if (bytes === null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getStatusBadge(evalItem: PendingEval) {
    switch (evalItem.status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'processing':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </Badge>
        );
      case 'success':
        return (
          <Badge variant="secondary" className="gap-1">
            <Check className="w-3 h-3" />
            Done
          </Badge>
        );
      case 'skipped':
        return (
          <Badge variant="outline" className="border-warning text-warning gap-1">
            <AlertTriangle className="w-3 h-3" />
            Skipped
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <X className="w-3 h-3" />
            Error
          </Badge>
        );
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg bg-card">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 h-auto"
        >
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4" />
            <span className="font-medium">Missing Transcripts & Insights</span>
            {pendingEvals.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingEvals.filter(e => e.status === 'pending').length} pending
              </Badge>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="px-4 pb-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={scanForMissing}
              disabled={isScanning || isProcessing}
            >
              {isScanning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Scan
            </Button>
            
            <Button
              size="sm"
              onClick={processAll}
              disabled={isProcessing || pendingEvals.filter(e => e.status === 'pending').length === 0}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Process All
            </Button>

            {pendingEvals.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {missingTranscriptCount > 0 && `${missingTranscriptCount} need transcription + insights`}
                {missingTranscriptCount > 0 && missingInsightsCount > 0 && ', '}
                {missingInsightsCount > 0 && `${missingInsightsCount} need insights only`}
              </span>
            )}
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing {currentIndex + 1} of {pendingEvals.filter(e => e.status !== 'success' && e.status !== 'skipped' && e.status !== 'error').length + completedCount}</span>
                <span>{Math.round((completedCount / pendingEvals.length) * 100)}%</span>
              </div>
              <Progress value={(completedCount / pendingEvals.length) * 100} />
            </div>
          )}

          {pendingEvals.length > 0 && (
            <div className="border rounded-lg max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Audio Size</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingEvals.map(evalItem => (
                    <TableRow key={evalItem.id}>
                      <TableCell className="font-medium">{evalItem.staffName}</TableCell>
                      <TableCell className="text-muted-foreground">{evalItem.locationName}</TableCell>
                      <TableCell>{evalItem.period}</TableCell>
                      <TableCell>{formatFileSize(evalItem.audioSize)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {evalItem.issue === 'no_transcript' ? 'Trans + Insights' : 'Insights Only'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(evalItem)}
                          {evalItem.message && evalItem.status !== 'success' && (
                            <span className="text-xs text-muted-foreground">{evalItem.message}</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pendingEvals.length === 0 && !isScanning && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Scan" to find evaluations needing transcription or insight extraction.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
