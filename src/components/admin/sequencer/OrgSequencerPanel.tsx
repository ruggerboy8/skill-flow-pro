import { useEffect, useState } from 'react';
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
import { fetchOrgInputsForRole } from '@/lib/sequencer/data';
import type { RoleId, TwoWeekResult } from '@/lib/sequencer/types';
import { Loader2, PlayCircle, Download } from 'lucide-react';

type Org = { id: string; name: string; timezone?: string | null };

const DRIVER_LABELS = {
  C: { label: 'Confidence', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  R: { label: 'Recency', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  E: { label: 'Eval', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  D: { label: 'Domain', color: 'bg-green-100 text-green-800 border-green-200' },
};

export function OrgSequencerPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<RoleId>(1);
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [timezone, setTimezone] = useState<string>('America/Chicago');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TwoWeekResult | null>(null);

  useEffect(() => {
    void loadOrgs();
  }, []);

  async function loadOrgs() {
    const { data, error } = await supabase.from('organizations').select('id, name');
    if (error) {
      toast({ title: 'Error', description: 'Failed to load organizations', variant: 'destructive' });
      return;
    }
    setOrgs(data || []);
    if (data?.length && !orgId) {
      setOrgId(data[0].id);
    }
  }

  useEffect(() => {
    const org = orgs.find(o => o.id === orgId);
    if (org) setTimezone(org.timezone || 'America/Chicago');
  }, [orgId, orgs]);

  async function onRun() {
    if (!orgId) {
      toast({ title: 'Select an organization', description: 'Choose an organization to run the sequencer.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const inputs = await fetchOrgInputsForRole({
        orgId,
        role,
        effectiveDate: new Date(`${effectiveDate}T12:00:00Z`),
        timezone,
      });

      const res = await computeNextAndPreview(inputs, defaultEngineConfig);
      setResult(res);
      toast({ title: 'Dry-run complete', description: 'Sequencer computed next week + preview successfully.' });
    } catch (e: any) {
      toast({ title: 'Run failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
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
            Compute Next Week + Preview using NeedScore v1. No database writes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Organization</Label>
            <Select value={orgId ?? ''} onValueChange={(v) => setOrgId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <div>
            <Label>Timezone</Label>
            <Input value={timezone} readOnly className="bg-muted" />
          </div>

          <div className="md:col-span-4 flex gap-3">
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
                  <span className="text-muted-foreground">Org:</span>
                  <span className="font-medium">{orgs.find(o => o.id === orgId)?.name}</span>
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
                  <CardDescription>Week of {plan.weekStart}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.picks.map((p, idx) => (
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
                        <Badge variant="outline" className="text-[10px] py-0">
                          Domain {p.domainId}
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
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
