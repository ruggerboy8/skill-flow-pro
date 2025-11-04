import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { defaultEngineConfig } from '@/lib/sequencer/config';
import { computeNextAndPreview } from '@/lib/sequencer/engine';
import { fetchAlcanInputsForRole } from '@/lib/sequencer/data';
import type { RoleId, TwoWeekResult } from '@/lib/sequencer/types';
import { Loader2, PlayCircle, Download, Upload } from 'lucide-react';
import type { OrgInputs } from '@/lib/sequencer/types';
import { DRIVER_LABELS } from '@/lib/constants/domains';
import { formatMmDdYyyy } from '@/v2/time';

type Domain = { id: number; name: string; color_hex?: string | null };

export function OrgSequencerPanel() {
  const [role, setRole] = useState<RoleId>(1);
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [timezone] = useState<string>('America/Chicago');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TwoWeekResult | null>(null);
  const [domainMap, setDomainMap] = useState<Map<number, Domain>>(new Map());
  const lastInputsRef = useRef<OrgInputs | null>(null);

  useEffect(() => {
    void loadDomains();
  }, []);

  async function loadDomains() {
    const { data, error } = await supabase.from('domains').select('domain_id, domain_name, color_hex');
    if (error) {
      toast({ title: 'Error', description: 'Failed to load domains', variant: 'destructive' });
      return;
    }
    setDomainMap(
      new Map(
        (data || []).map((d: any) => [
          Number(d.domain_id),
          { id: Number(d.domain_id), name: d.domain_name, color_hex: d.color_hex },
        ])
      )
    );
  }

  async function onRun() {
    setLoading(true);
    setResult(null);
    try {
      const inputs = await fetchAlcanInputsForRole({
        role,
        effectiveDate: new Date(`${effectiveDate}T12:00:00Z`),
        timezone,
      });

      lastInputsRef.current = inputs; // Store for simulation publish

      const res = await computeNextAndPreview(inputs, defaultEngineConfig);
      setResult(res);
      toast({ title: 'Dry-run complete', description: 'Sequencer computed Alcan-wide next week + preview.' });
    } catch (e: any) {
      toast({ title: 'Run failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function onSaveAsSimulation() {
    if (!lastInputsRef.current) {
      toast({ title: 'Run Dry-Run first', description: 'No inputs to publish', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('sequencer-sim-upsert', {
        body: { roleId: role, inputs: lastInputsRef.current }
      });
      if (error) throw error;
      toast({ title: 'Simulation Published', description: 'Coach Simulation Mode now reflects this dry-run.' });
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e?.message || 'Unable to save simulation', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function copyJson() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast({ title: 'Copied', description: 'Sequencer result copied to clipboard.' });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Org Sequencer (Dry-Run)</CardTitle>
          <CardDescription>
            Compute Next Week + Preview using NeedScore v1 across all Alcan organizations. No database writes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Role</Label>
            <Select value={String(role)} onValueChange={(v) => setRole(Number(v) as RoleId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">DFI</SelectItem>
                <SelectItem value="2">RDA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Effective Date</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>

          <div className="md:col-span-2 flex gap-3">
            <Button onClick={onRun} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Run Dry-Run
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={onSaveAsSimulation} disabled={!result || saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Save as Simulation
                </>
              )}
            </Button>
            <Button variant="outline" onClick={copyJson} disabled={!result}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Run Meta & Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope:</span>
                  <span className="font-medium">Alcan-wide</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role:</span>
                  <span className="font-medium">{role === 1 ? 'DFI' : 'RDA'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TZ:</span>
                  <span className="font-medium">{timezone}</span>
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Engine Logs</h4>
                <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground max-h-96 overflow-y-auto">
                  {result.logs.map((line, i) => (
                    <li key={i} className="leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>

          {(['next', 'preview'] as const).map((k) => {
            const plan = result[k];
            return (
              <Card key={k}>
                <CardHeader>
                  <CardTitle>{k === 'next' ? '📅 Next Week' : '🔮 Preview (N+1)'}</CardTitle>
                  <CardDescription>Week of {formatMmDdYyyy(plan.weekStart, timezone)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.picks.map((p, idx) => {
                    const domain = domainMap.get(p.domainId);
                    const domainLabel = domain?.name ?? `Domain ${p.domainId}`;
                    const domainStyle = domain?.color_hex
                      ? { backgroundColor: domain.color_hex, color: '#111', borderColor: domain.color_hex }
                      : undefined;

                    return (
                      <div key={p.proMoveId} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {idx + 1}. {p.name}
                            </div>
                          </div>
                          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                            {p.finalScore.toFixed(2)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Badge variant="outline" className="text-[10px] py-0" style={domainStyle}>
                            {domainLabel}
                          </Badge>
                          {p.drivers.map((d) => {
                            const driverInfo = DRIVER_LABELS[d];
                            return (
                              <Badge
                                key={d}
                                variant="outline"
                                className={`text-[10px] py-0 ${driverInfo.color}`}
                              >
                                {driverInfo.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
