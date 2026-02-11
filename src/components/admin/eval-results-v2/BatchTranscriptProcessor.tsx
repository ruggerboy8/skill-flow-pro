import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Mic, ChevronDown, Search, Play, Check, AlertTriangle, Loader2, X, Square } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBatchProcessor } from '@/contexts/BatchProcessorContext';

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

function formatPeriod(type: string, quarter: string | null, year: number): string {
  if (type === 'Baseline') return 'Baseline';
  return quarter ? `${quarter} ${year}` : `${year}`;
}

export function BatchTranscriptProcessor() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const { state, setPendingEvals, startProcessing, stopProcessing, resetState } = useBatchProcessor();
  const { isProcessing, isStopping, pendingEvals, currentIndex } = state;

  const missingTranscriptCount = pendingEvals.filter(e => e.issue === 'no_transcript').length;
  const missingInsightsCount = pendingEvals.filter(e => e.issue === 'no_insights').length;
  const completedCount = pendingEvals.filter(e => e.status === 'success' || e.status === 'skipped' || e.status === 'error').length;
  const pendingCount = pendingEvals.filter(e => e.status === 'pending').length;

  // Cost estimates (rough approximations)
  const estimatedCostMin = (missingTranscriptCount * 0.06) + (missingInsightsCount * 0.02);
  const estimatedCostMax = (missingTranscriptCount * 0.10) + (missingInsightsCount * 0.04);
  const estimatedTimeMin = Math.ceil((missingTranscriptCount * 15 + missingInsightsCount * 5) / 60);
  const estimatedTimeMax = Math.ceil((missingTranscriptCount * 30 + missingInsightsCount * 10) / 60);

  async function scanForMissing() {
    setIsScanning(true);
    resetState();

    try {
      const { data, error } = await supabase
        .from('evaluations')
        .select(`
          id,
          audio_recording_path,
          summary_raw_transcript,
          interview_transcript,
          extracted_insights,
          staff_id,
          location_id,
          type,
          quarter,
          program_year
        `)
        .or('and(audio_recording_path.not.is.null,summary_raw_transcript.is.null,interview_transcript.is.null),and(summary_raw_transcript.not.is.null,extracted_insights.is.null),and(interview_transcript.not.is.null,extracted_insights.is.null)');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.info('All evaluations are up to date');
        return;
      }

      const staffIds = [...new Set(data.map(d => d.staff_id))];
      const locationIds = [...new Set(data.map(d => d.location_id))];

      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name')
        .in('id', staffIds);
      const staffMap = new Map((staffData || []).map(s => [s.id, s.name]));

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

        const transcript = row.summary_raw_transcript || row.interview_transcript;
        
        if (row.audio_recording_path && !transcript) {
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
        } else if (transcript && !row.extracted_insights) {
          evals.push({
            id: row.id,
            staffName,
            locationName,
            period,
            audioPath: row.audio_recording_path,
            audioSize: null,
            hasTranscript: true,
            hasInsights: false,
            existingTranscript: transcript,
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

  function handleStartProcessing() {
    setShowConfirmDialog(false);
    startProcessing();
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
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 h-auto"
          >
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              <span className="font-medium">Missing Transcripts & Insights</span>
              {isProcessing && (
                <Badge variant="default" className="ml-2 animate-pulse">
                  Processing...
                </Badge>
              )}
              {!isProcessing && pendingEvals.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCount} pending
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
              
              {isProcessing ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={stopProcessing}
                  disabled={isStopping}
                >
                  <Square className="w-4 h-4 mr-2" />
                  {isStopping ? 'Stopping...' : 'Stop'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={pendingCount === 0}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Process All
                </Button>
              )}

              {pendingEvals.length > 0 && !isProcessing && (
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
                  <span>Processing {currentIndex + 1} of {pendingEvals.length}</span>
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
                            {evalItem.message && (
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
              <p className="text-sm text-muted-foreground">
                Click "Scan" to find evaluations with audio recordings that haven't been transcribed yet.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Confirm Batch Processing
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will process <strong>{pendingCount}</strong> evaluation(s):</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {missingTranscriptCount > 0 && (
                    <li>{missingTranscriptCount} need transcription + insights</li>
                  )}
                  {missingInsightsCount > 0 && (
                    <li>{missingInsightsCount} need insights only</li>
                  )}
                </ul>
                <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                  <p><strong>Estimated cost:</strong> ${estimatedCostMin.toFixed(2)} - ${estimatedCostMax.toFixed(2)}</p>
                  <p><strong>Estimated time:</strong> {estimatedTimeMin}-{estimatedTimeMax} minutes</p>
                </div>
                <p className="text-sm">
                  You can stop at any time. Already-processed items will remain updated.
                  <strong> Processing will continue even if you navigate away.</strong>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartProcessing}>
              Start Processing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
