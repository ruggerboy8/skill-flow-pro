import { useState } from 'react';
import { Play, Download, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { RankRequest, RankResponse } from '@/lib/sequencer/types';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/sequencer/types';
import { DOMAIN_META, DRIVER_LABELS } from '@/lib/constants/domains';
import { downloadCSV } from '@/lib/csvExport';

export function WeeklyProMovesPanel() {
  const [roleId, setRoleId] = useState<1 | 2>(2);
  const [weights, setWeights] = useState(DEFAULT_ENGINE_CONFIG.weights);
  const [advanced, setAdvanced] = useState({
    cooldownWeeks: DEFAULT_ENGINE_CONFIG.cooldownWeeks,
    diversityMinDomainsPerWeek: DEFAULT_ENGINE_CONFIG.diversityMinDomainsPerWeek,
    recencyHorizonWeeks: DEFAULT_ENGINE_CONFIG.recencyHorizonWeeks,
    ebPrior: DEFAULT_ENGINE_CONFIG.ebPrior,
    ebK: DEFAULT_ENGINE_CONFIG.ebK,
    trimPct: DEFAULT_ENGINE_CONFIG.trimPct,
    evalCap: DEFAULT_ENGINE_CONFIG.evalCap,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RankResponse | null>(null);

  const weightsSum = weights.C + weights.R + weights.E + weights.D;
  const needsNormalization = Math.abs(weightsSum - 1.0) > 0.001;

  const handleRun = async () => {
    setLoading(true);
    try {
      // Normalize weights
      const normalizedWeights = needsNormalization
        ? {
            C: weights.C / weightsSum,
            R: weights.R / weightsSum,
            E: weights.E / weightsSum,
            D: weights.D / weightsSum,
          }
        : weights;

      const request: RankRequest = {
        roleId,
        weights: normalizedWeights,
        ...advanced,
      };

      const { data: result, error } = await supabase.functions.invoke('sequencer-rank', {
        body: request,
      });

      if (error) throw error;

      setData(result);
      toast.success('Rankings computed successfully');
    } catch (error) {
      console.error('Failed to compute rankings:', error);
      toast.error('Failed to compute rankings');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `weekly-promoves-${roleId === 1 ? 'dfi' : 'rda'}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!data) return;
    const csvData = data.ranked.map((row, idx) => ({
      rank: idx + 1,
      proMoveId: row.proMoveId,
      name: row.name,
      domainName: row.domainName,
      final: row.finalScore.toFixed(3),
      C: row.parts.C.toFixed(3),
      R: row.parts.R.toFixed(3),
      E: row.parts.E.toFixed(3),
      D: row.parts.D.toFixed(3),
      confidenceN: row.confidenceN,
      lastSeen: row.lastSeen || '—',
      weeksSinceSeen: row.weeksSinceSeen,
    }));
    downloadCSV(csvData, `weekly-promoves-${roleId === 1 ? 'dfi' : 'rda'}`);
  };

  const getDomainChipClass = (domainId: number) => {
    return DOMAIN_META[domainId]?.chipClass || 'bg-muted';
  };

  const getDriverLabel = (driver: string) => {
    return DRIVER_LABELS[driver]?.label || driver;
  };

  const getDriverClass = (driver: string) => {
    return DRIVER_LABELS[driver]?.className || 'bg-muted';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Weekly Pro Moves (Read-Only)</h2>
        <p className="text-muted-foreground mt-1">
          Compute ranked Pro Move lists using NeedScore v1. No writes to schedules.
        </p>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Role selector */}
        <Card>
          <CardHeader>
            <CardTitle>Role</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={String(roleId)} onValueChange={(v) => setRoleId(Number(v) as 1 | 2)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">DFI</SelectItem>
                <SelectItem value="2">RDA</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Weights */}
        <Card>
          <CardHeader>
            <CardTitle>NeedScore Weights</CardTitle>
            <CardDescription>
              Recommended defaults: C=0.65, R=0.15, E=0.15, D=0.05.
              {needsNormalization && ' Weights will auto-normalize to sum to 1.00 on run.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label>C (Confidence): {weights.C.toFixed(2)}</Label>
                <Slider
                  value={[weights.C]}
                  onValueChange={([v]) => setWeights({ ...weights, C: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>R (Recency): {weights.R.toFixed(2)}</Label>
                <Slider
                  value={[weights.R]}
                  onValueChange={([v]) => setWeights({ ...weights, R: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>E (Eval): {weights.E.toFixed(2)}</Label>
                <Slider
                  value={[weights.E]}
                  onValueChange={([v]) => setWeights({ ...weights, E: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>D (Domain): {weights.D.toFixed(2)}</Label>
                <Slider
                  value={[weights.D]}
                  onValueChange={([v]) => setWeights({ ...weights, D: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  className="mt-2"
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Sum: {weightsSum.toFixed(2)} {needsNormalization && '(will normalize)'}
            </div>
          </CardContent>
        </Card>

        {/* Advanced */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CardHeader>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                  <CardTitle>Advanced Configuration</CardTitle>
                  {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cooldown Weeks (≥0)</Label>
                    <Input
                      type="number"
                      value={advanced.cooldownWeeks}
                      onChange={(e) => setAdvanced({ ...advanced, cooldownWeeks: Math.max(0, Number(e.target.value)) })}
                      min={0}
                    />
                  </div>
                  <div>
                    <Label>Min Domains per Week (1-4)</Label>
                    <Input
                      type="number"
                      value={advanced.diversityMinDomainsPerWeek}
                      onChange={(e) => setAdvanced({ ...advanced, diversityMinDomainsPerWeek: Math.max(1, Math.min(4, Number(e.target.value))) })}
                      min={1}
                      max={4}
                    />
                  </div>
                  <div>
                    <Label>Recency Horizon Weeks (0=auto)</Label>
                    <Input
                      type="number"
                      value={advanced.recencyHorizonWeeks}
                      onChange={(e) => setAdvanced({ ...advanced, recencyHorizonWeeks: Math.max(0, Number(e.target.value)) })}
                      min={0}
                    />
                  </div>
                  <div>
                    <Label>EB Prior (0.40-0.85)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={advanced.ebPrior}
                      onChange={(e) => setAdvanced({ ...advanced, ebPrior: Math.max(0.4, Math.min(0.85, Number(e.target.value))) })}
                      min={0.4}
                      max={0.85}
                    />
                  </div>
                  <div>
                    <Label>EB K (1-100)</Label>
                    <Input
                      type="number"
                      value={advanced.ebK}
                      onChange={(e) => setAdvanced({ ...advanced, ebK: Math.max(1, Math.min(100, Number(e.target.value))) })}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div>
                    <Label>Trim % (0-0.15)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={advanced.trimPct}
                      onChange={(e) => setAdvanced({ ...advanced, trimPct: Math.max(0, Math.min(0.15, Number(e.target.value))) })}
                      min={0}
                      max={0.15}
                    />
                  </div>
                  <div>
                    <Label>Eval Cap (0-0.40)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={advanced.evalCap}
                      onChange={(e) => setAdvanced({ ...advanced, evalCap: Math.max(0, Math.min(0.4, Number(e.target.value))) })}
                      min={0}
                      max={0.4}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Keep defaults unless testing. Preview assumes Next is consumed.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button onClick={handleRun} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Play />}
            Run
          </Button>
          <Button variant="outline" onClick={handleExportJson} disabled={!data}>
            <Download /> Export JSON
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={!data}>
            <Download /> Export CSV
          </Button>
        </div>
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-6">
          {/* Meta card */}
          <Card>
            <CardHeader>
              <CardTitle>Run Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Role</div>
                <div className="font-medium">{roleId === 1 ? 'DFI' : 'RDA'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Timezone</div>
                <div className="font-medium">{data.timezone}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Eligible Moves</div>
                <div className="font-medium">{data.ranked.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Run Time</div>
                <div className="font-medium">{new Date().toLocaleTimeString()}</div>
              </div>
            </CardContent>
          </Card>

          {/* Week cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Next week */}
            <Card>
              <CardHeader>
                <CardTitle>Next Week</CardTitle>
                <CardDescription>Week of {data.weekStartNext}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.next.map((pick, i) => (
                  <div key={pick.proMoveId} className="border rounded-lg p-3">
                    <div className="font-medium text-sm">#{i + 1}: {pick.name}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge className={getDomainChipClass(pick.domainId)}>
                        {pick.domainName}
                      </Badge>
                      {pick.drivers.map(d => (
                        <Badge key={d} variant="outline" className={getDriverClass(d)}>
                          {getDriverLabel(d)}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Score: {pick.finalScore.toFixed(3)} | C:{pick.parts.C.toFixed(2)} R:{pick.parts.R.toFixed(2)} E:{pick.parts.E.toFixed(2)} D:{pick.parts.D.toFixed(2)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Preview week */}
            <Card>
              <CardHeader>
                <CardTitle>Preview (N+1)</CardTitle>
                <CardDescription>Week of {data.weekStartPreview}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.preview.map((pick, i) => (
                  <div key={pick.proMoveId} className="border rounded-lg p-3">
                    <div className="font-medium text-sm">#{i + 1}: {pick.name}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge className={getDomainChipClass(pick.domainId)}>
                        {pick.domainName}
                      </Badge>
                      {pick.drivers.map(d => (
                        <Badge key={d} variant="outline" className={getDriverClass(d)}>
                          {getDriverLabel(d)}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Score: {pick.finalScore.toFixed(3)} | C:{pick.parts.C.toFixed(2)} R:{pick.parts.R.toFixed(2)} E:{pick.parts.E.toFixed(2)} D:{pick.parts.D.toFixed(2)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Ranked table */}
          <Card>
            <CardHeader>
              <CardTitle>All Candidates (Ranked)</CardTitle>
              <CardDescription>Top 100 shown</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Pro Move</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="w-20">Final</TableHead>
                      <TableHead className="w-16">C</TableHead>
                      <TableHead className="w-16">R</TableHead>
                      <TableHead className="w-16">E</TableHead>
                      <TableHead className="w-16">D</TableHead>
                      <TableHead className="w-20">Conf N</TableHead>
                      <TableHead className="w-28">Last Seen</TableHead>
                      <TableHead className="w-20">Weeks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ranked.slice(0, 100).map((row, idx) => (
                      <TableRow key={row.proMoveId}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <Badge className={getDomainChipClass(row.domainId)}>
                            {row.domainName}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.finalScore.toFixed(3)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.parts.C.toFixed(3)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.parts.R.toFixed(3)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.parts.E.toFixed(3)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.parts.D.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-xs">{row.confidenceN}</TableCell>
                        <TableCell className="text-xs">{row.lastSeen || '—'}</TableCell>
                        <TableCell className="text-xs">{row.weeksSinceSeen}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Logs */}
          {data.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Engine Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-1 text-xs font-mono">
                    {data.logs.map((log, i) => (
                      <div key={i} className="text-muted-foreground">{log}</div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
