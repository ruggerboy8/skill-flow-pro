import { useState } from 'react';
import { Play, Download, Loader2, ChevronDown, ChevronUp, Info, RotateCcw } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import type { RankRequest, RankResponse } from '@/lib/sequencer/types';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/sequencer/types';
import { DOMAIN_META, DRIVER_LABELS } from '@/lib/constants/domains';
import { downloadCSV } from '@/lib/csvExport';

export function WeeklyProMovesPanel() {
  const [roleId, setRoleId] = useState<1 | 2 | 3>(2);
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
    const roleName = roleId === 1 ? 'dfi' : roleId === 2 ? 'rda' : 'om';
    link.download = `weekly-promoves-${roleName}-${new Date().toISOString().slice(0, 10)}.json`;
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

  const getStatusBadge = (status: string, severity?: number) => {
    if (status === 'critical') {
      return (
        <Badge variant="destructive" className="gap-1">
          🚨 CRITICAL {severity !== undefined && `(${Math.round(severity * 100)}%)`}
        </Badge>
      );
    }
    if (status === 'watch') {
      return (
        <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700 dark:text-yellow-400">
          ⚠️ Watch
        </Badge>
      );
    }
    return null;
  };

  // Filter drivers to exclude R when weight is 0
  const getActiveDrivers = (drivers: string[]) => {
    return drivers.filter(d => !(d === 'R' && weights.R === 0));
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

      {/* Recency Disabled Banner */}
      {weights.R === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Recency is disabled in scoring.</strong> While locations are out of sync, we're temporarily excluding Recency (R) from calculations. 
            Cooldown and diversity constraints still apply.
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <div className="space-y-4">
        {/* Role selector */}
        <Card>
          <CardHeader>
            <CardTitle>Role</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={String(roleId)} onValueChange={(v) => setRoleId(Number(v) as 1 | 2 | 3)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">DFI</SelectItem>
                <SelectItem value="2">RDA</SelectItem>
                <SelectItem value="3">Office Manager</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Weights */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <CardTitle>NeedScore Weights</CardTitle>
                <CardDescription>
                  Final = C·wC + R·wR + E·wE + D·wD (0–1). Higher = higher priority for selection.
                  {needsNormalization && ' Weights will auto-normalize to sum to 1.00 on run.'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeights(DEFAULT_ENGINE_CONFIG.weights)}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2 p-3 bg-muted/50 rounded-lg mb-4">
              <p className="font-medium">What the score means:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>Confidence (C)</strong> – How under-confident are we? (Primary driver)</li>
                <li><strong>Recency (R)</strong> – Time since last scheduled (Currently disabled)</li>
                <li><strong>Eval (E)</strong> – Quarterly evaluation gap indicator</li>
                <li><strong>Domain (D)</strong> – Domain diversity nudge</li>
              </ul>
            </div>
            <TooltipProvider>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label>C (Confidence): {weights.C.toFixed(2)}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>How under-confident are we on this move? Derived from recent confidence ratings with outliers trimmed and EB-smoothed. Higher C = lower confidence → higher priority.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-2 mb-2">
                    <Label>R (Recency): {weights.R.toFixed(2)} {weights.R === 0 && '(Disabled)'}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Lift for moves not scheduled recently (between cooldown and horizon). Encourages rotation. Currently disabled while locations are out of sync.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Slider
                    value={[weights.R]}
                    onValueChange={([v]) => setWeights({ ...weights, R: v })}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mt-2"
                    disabled={true}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label>E (Eval): {weights.E.toFixed(2)}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>How much the last quarterly evaluation indicates a gap for this move's competency. Capped by Eval Cap so evals inform but don't dominate.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-2 mb-2">
                    <Label>D (Domain): {weights.D.toFixed(2)}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Nudge for domains that appeared less often in the last 8 weeks. Helps maintain variety across domains.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
            </TooltipProvider>
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
                <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded mb-3">
                  <p>Advanced parameters control EB smoothing, cooldown, diversity constraints, and eval caps. Keep defaults unless testing.</p>
                </div>
                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label>Cooldown Weeks (≥0)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Minimum number of weeks before the same move can be selected again. Higher = longer rest between repeats.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={advanced.cooldownWeeks}
                        onChange={(e) => setAdvanced({ ...advanced, cooldownWeeks: Math.max(0, Number(e.target.value)) })}
                        min={0}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label>Min Domains per Week (1-4)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Minimum count of distinct domains among the 3 weekly picks. We'll log a 'Relaxation' if it can't be met.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={advanced.diversityMinDomainsPerWeek}
                        onChange={(e) => setAdvanced({ ...advanced, diversityMinDomainsPerWeek: Math.max(1, Math.min(4, Number(e.target.value))) })}
                        min={1}
                        max={4}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label>Recency Horizon Weeks (0=auto)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Upper bound for R to hit 1. Set 0 to auto-compute based on library size.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={advanced.recencyHorizonWeeks}
                        onChange={(e) => setAdvanced({ ...advanced, recencyHorizonWeeks: Math.max(0, Number(e.target.value)) })}
                        min={0}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label>EB Prior (0.40-0.85)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Assumed baseline confidence when data is sparse (e.g., 0.70 = 7/10). Higher prior makes trends more conservative.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
                      <div className="flex items-center gap-2 mb-1">
                        <Label>EB K (strength) (1-100)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>How heavily the prior is weighted vs. observed data. Higher values reduce volatility from small sample sizes.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={advanced.ebK}
                        onChange={(e) => setAdvanced({ ...advanced, ebK: Math.max(1, Math.min(100, Number(e.target.value))) })}
                        min={1}
                        max={100}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label>Trim % (0-0.15)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Removes extreme highs and lows before smoothing. Use higher trim if you see spiky data.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
                      <div className="flex items-center gap-2 mb-1">
                        <Label>Eval Cap (0-0.40)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Maximum share that Eval can contribute to the final. Prevents a single eval gap from outweighing ongoing confidence data.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
                </TooltipProvider>
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
                      {getStatusBadge(pick.status, pick.severity)}
                      {getActiveDrivers(pick.drivers).map(d => (
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
                      {getStatusBadge(pick.status, pick.severity)}
                      {getActiveDrivers(pick.drivers).map(d => (
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
              <CardDescription>
                Top 100 shown. Legend: <strong>Final</strong> = combined score (0–1) | <strong>C/R/E/D</strong> = component signals | 
                <strong>Drivers</strong> = top 2 weighted contributors | <strong>Conf N</strong> = total sample count | 
                <strong>Status</strong>: 🚨 Critical (≤0.20 EB-conf) | ⚠️ Watch (borderline)
              </CardDescription>
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
                          <div className="flex flex-wrap gap-1">
                            <Badge className={getDomainChipClass(row.domainId)}>
                              {row.domainName}
                            </Badge>
                            {getStatusBadge(row.status, row.severity)}
                          </div>
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
