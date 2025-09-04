import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useReliableSubmission } from '@/hooks/useReliableSubmission';

export function SubmissionStatus() {
  const { pendingCount, isProcessing } = useReliableSubmission();

  if (pendingCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Badge 
        variant={isProcessing ? "default" : "secondary"} 
        className="flex items-center gap-2 p-2 shadow-lg"
      >
        {isProcessing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        {pendingCount} submission{pendingCount > 1 ? 's' : ''} pending
      </Badge>
    </div>
  );
}