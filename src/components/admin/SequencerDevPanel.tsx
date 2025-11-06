import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, Save, RefreshCw } from 'lucide-react';

const APP_TZ = 'America/Chicago';

interface SequencerDevPanelProps {
  roleId: number;
  roleName: string;
}

interface Weights {
  C: number;
  R: number;
  E: number;
  D: number;
}

export function SequencerDevPanel({ roleId, roleName }: SequencerDevPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState<Weights>({ C: 0.80, R: 0.00, E: 0.15, D: 0.05 });
  const [rankPreview, setRankPreview] = useState<any>(null);

  const kvKey = `sequencer:weights:role:${roleId}`;

  useEffect(() => {
    loadWeights();
  }, [roleId]);

  const loadWeights = async () => {
    try {
      const { data } = await supabase
        .from('app_kv')
        .select('value')
        .eq('key', kvKey)
        .single();

      if (data?.value && typeof data.value === 'object' && 'C' in data.value) {
        setWeights(data.value as unknown as Weights);
      }
    } catch (error) {
      console.log('No saved weights, using defaults');
    }
  };

  const saveWeights = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('app_kv')
        .upsert(
          {
            key: kvKey,
            value: weights as any,
          },
          { onConflict: 'key' }
        );

      if (error) throw error;

      toast({
        title: 'Weights Saved',
        description: `Saved to ${kvKey}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRankPreview = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
          timezone: APP_TZ,
          weights,
        },
      });

      if (error) throw error;

      setRankPreview(data);
      toast({
        title: 'Recommender Complete',
        description: `Ranked ${data?.ranked?.length || 0} eligible moves`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Pro-Move Recommender - {roleName}
        </CardTitle>
        <CardDescription>
          Rank pro-moves by priority using custom weights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Weights Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Weights</Label>
            <Button onClick={saveWeights} size="sm" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>

          {(['C', 'R', 'E', 'D'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-mono">{key}</Label>
                <span className="text-sm font-mono">{weights[key].toFixed(2)}</span>
              </div>
              <Slider
                value={[weights[key] * 100]}
                onValueChange={([val]) => setWeights({ ...weights, [key]: val / 100 })}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            Sum: {(weights.C + weights.R + weights.E + weights.D).toFixed(2)}
          </div>
        </div>

        {/* Action */}
        <Button onClick={handleRankPreview} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run Recommender
        </Button>

        {/* Results */}
        {rankPreview && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
            <div className="font-semibold">Recommended Pro-Moves (Top 6):</div>
            <div className="text-sm space-y-1">
              <div>Total Eligible: {rankPreview.ranked?.length || 0}</div>
              <ul className="ml-4 space-y-1 mt-2">
                {rankPreview.ranked?.slice(0, 6).map((move: any, i: number) => (
                  <li key={i} className="text-xs font-mono">
                    {i + 1}. {move.name} ({move.domainName}) - Score: {move.finalScore?.toFixed(3)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
