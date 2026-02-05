import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface GutCheckPromptProps {
  domainName: string;
  hasFoursInDomain: boolean;
  isAlreadyFlagged: boolean;
  onFlag: (domain: string) => Promise<void>;
}

export function GutCheckPrompt({
  domainName,
  hasFoursInDomain,
  isAlreadyFlagged,
  onFlag,
}: GutCheckPromptProps) {
  const [dismissed, setDismissed] = useState(false);
  const [flagging, setFlagging] = useState(false);

  // Don't show if no 4s in this domain, already flagged, or dismissed
  if (!hasFoursInDomain || isAlreadyFlagged || dismissed) return null;

  const handleAccurate = () => {
    setDismissed(true);
  };

  const handleGenerous = async () => {
    setFlagging(true);
    try {
      await onFlag(domainName);
      toast({
        title: 'Flagged for discussion',
        description: 'You can discuss these with Alex in your check-in.',
      });
      setDismissed(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save flag. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setFlagging(false);
    }
  };

  return (
    <Card className="bg-muted/30 border-dashed mb-4">
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground mb-3">
          <span className="font-medium text-foreground">Quick gut check:</span>{' '}
          do the items in your '4' list feel true on your busiest day?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAccurate}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Yes, feels accurate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerous}
            disabled={flagging}
            className="gap-2"
          >
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {flagging ? 'Saving...' : 'Some might be generous'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
