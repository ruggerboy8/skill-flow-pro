import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar, Play, TestTube } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';

interface TimeTravelPanelProps {
  roleId: number;
  roleName: string;
  onRefresh?: () => void;
}

export function TimeTravelPanel({ roleId, roleName, onRefresh }: TimeTravelPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);

  const handleDryRun = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: {
          roles: [roleId],
          asOf: asOfDate || undefined,
          dryRun: true,
          force: true
        }
      });

      if (error) throw error;

      setPreviewData(data);
      toast({
        title: 'Dry-Run Complete',
        description: 'Preview generated without writing to database'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForceRollover = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: {
          roles: [roleId],
          asOf: asOfDate || undefined,
          dryRun: false,
          force: true
        }
      });

      if (error) throw error;

      toast({
        title: 'Rollover Complete',
        description: `Forced rollover executed for ${roleName}`
      });
      
      setPreviewData(data);
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Picker */}
      <div className="space-y-2">
        <Label htmlFor="asOf">As-Of Date (Optional)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="asOf"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="pl-10"
              placeholder="Leave empty for now"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAsOfDate('')}
          >
            Clear
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave empty to use current time. Set a date to simulate rollover at that time.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handleDryRun}
          disabled={loading}
          variant="outline"
          className="flex-1"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4 mr-2" />
          )}
          Dry-Run (Preview)
        </Button>
        <Button
          onClick={handleForceRollover}
          disabled={loading}
          variant="destructive"
          className="flex-1"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Force Rollover
        </Button>
      </div>

      {/* Preview Results */}
      {previewData && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Rollover Results</h3>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {JSON.stringify(previewData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Warning */}
      <div className="text-xs text-muted-foreground p-3 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800">
        ⚠️ <strong>Dev Tools:</strong> These controls bypass normal time/gate checks. Use with caution in production.
      </div>
    </div>
  );
}
