import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plug,
  RefreshCw,
  Loader2,
  Unplug,
  CheckCircle2,
  AlertCircle,
  Beaker,
  Eye,
  Users,
  CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  organizationId: string;
}

interface DeputyConnection {
  deputy_install: string;
  deputy_region: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  sync_enabled: boolean;
  sync_start_date: string | null;
}

export function DeputyConnectionCard({ organizationId }: Props) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["deputy-connection", organizationId],
    queryFn: async (): Promise<DeputyConnection | null> => {
      const { data, error } = await (supabase as any)
        .from("deputy_connections")
        .select(
          "deputy_install, deputy_region, last_sync_at, last_sync_status, last_sync_error, sync_enabled, sync_start_date"
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data as DeputyConnection | null;
    },
  });

  // Count of mappings that still need review — used to gate live sync
  const { data: needsReviewCount = 0 } = useQuery({
    queryKey: ["deputy-mappings-needs-review", organizationId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_confirmed", false)
        .eq("is_ignored", false)
        .not("staff_id", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!connection,
  });

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-initiate-oauth");
      if (error) throw error;
      if (!data?.url) throw new Error("No authorization URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Failed to start Deputy connection", { description: err?.message });
      setConnecting(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-sync", {
        body: { dry_run: true, days: 7 },
      });
      if (error) throw error;
      setPreviewResult(data);
      toast.success("Preview pulled", {
        description: `${data?.employee_count ?? 0} employees · ${data?.timesheet_count ?? 0} timesheets · ${data?.absent_all_week_count ?? 0} absent`,
      });
    } catch (err: any) {
      toast.error("Preview failed", { description: err?.message });
    } finally {
      setPreviewing(false);
    }
  };

  const handleImportEmployees = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-sync", {
        body: { dry_run: false, employees_only: true },
      });
      if (error) throw error;
      const created = data?.new_mappings_created ?? 0;
      const suggested = data?.auto_suggested ?? 0;
      toast.success(`Imported ${data?.employee_count ?? 0} Deputy employees`, {
        description: `${created} new mapping${created === 1 ? "" : "s"} · ${suggested} auto-suggested`,
      });
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings-needs-review", organizationId] });
    } catch (err: any) {
      toast.error("Import failed", { description: err?.message });
    } finally {
      setImporting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-sync", { body: { dry_run: false } });
      if (error) throw error;
      if (data?.skipped) {
        toast.error("Sync skipped", { description: data?.message ?? data?.reason });
        return;
      }
      const excused = data?.absent_all_week_count ?? data?.staff_absent_all_week ?? 0;
      const weekOf = data?.week_of ? ` for week of ${data.week_of}` : "";
      toast.success(`Synced — ${excused} staff excused${weekOf}`);
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
    } catch (err: any) {
      toast.error("Sync failed", { description: err?.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-test-connection", { body: {} });
      if (error) throw error;
      setTestResult(data);
      if (data?.ok) {
        toast.success("Deputy connection works");
      } else {
        toast.error("Deputy test failed", { description: data?.error ?? "Unknown error" });
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message });
      toast.error("Deputy test failed", { description: err?.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await (supabase as any)
        .from("deputy_connections")
        .delete()
        .eq("organization_id", organizationId);
      if (error) throw error;
      toast.success("Deputy disconnected");
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
    } catch (err: any) {
      toast.error("Failed to disconnect", { description: err?.message });
    } finally {
      setConfirmDisconnect(false);
    }
  };

  const updateSyncSettings = async (patch: { sync_enabled?: boolean; sync_start_date?: string | null }) => {
    setSavingSettings(true);
    try {
      // If enabling for the first time and no start date set, default to today
      if (patch.sync_enabled === true && !connection?.sync_start_date && patch.sync_start_date === undefined) {
        patch.sync_start_date = format(new Date(), "yyyy-MM-dd");
      }
      const { error } = await (supabase as any)
        .from("deputy_connections")
        .update(patch)
        .eq("organization_id", organizationId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
      toast.success("Sync settings updated");
    } catch (err: any) {
      toast.error("Failed to update settings", { description: err?.message });
    } finally {
      setSavingSettings(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = !!connection;
  const syncEnabled = !!connection?.sync_enabled;
  const startDate = connection?.sync_start_date ? new Date(connection.sync_start_date + "T00:00:00") : undefined;
  const syncDisabledReason = !syncEnabled
    ? "Enable sync in Sync Settings before running a live sync."
    : needsReviewCount > 0
    ? `${needsReviewCount} employee mapping${needsReviewCount === 1 ? "" : "s"} still need review.`
    : null;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Plug className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Deputy</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your Deputy account to automatically excuse absent staff from Pro Moves submissions.
                </p>
              </div>
            </div>
            {isConnected && (
              <Badge
                className="border-0"
                style={{
                  backgroundColor: `hsl(var(--status-complete-bg))`,
                  color: `hsl(var(--status-complete))`,
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plug className="h-4 w-4 mr-2" />
              )}
              Connect Deputy
            </Button>
          ) : (
            <div className="space-y-5">
              {/* ── Connection facts ─────────────────────────────────── */}
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Deputy install</span>
                  <span className="font-mono text-xs">
                    {connection.deputy_install}.{connection.deputy_region}.deputy.com
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Last synced</span>
                  <span>
                    {connection.last_sync_at
                      ? formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })
                      : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last sync status</span>
                  <SyncStatusBadge status={connection.last_sync_status} />
                </div>
                {connection.last_sync_error && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">
                    {connection.last_sync_error}
                  </p>
                )}
              </div>

              {/* ── Phase 1: Preview ─────────────────────────────────── */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Step 1 — Preview Deputy data
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pulls a 7-day sample with no DB writes. Confirm the data shape before importing.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handlePreview} disabled={previewing}>
                    {previewing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    Pull 7-Day Preview
                  </Button>
                </div>
                {previewResult && <PreviewPanel data={previewResult} />}
              </div>

              {/* ── Phase 2: Import employees ────────────────────────── */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Step 2 — Import Deputy employees
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pulls the active roster and writes mappings with auto-suggested staff matches. Safe to re-run.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleImportEmployees} disabled={importing}>
                    {importing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4 mr-2" />
                    )}
                    Import Deputy Employees
                  </Button>
                </div>
              </div>

              {/* ── Phase 3: Sync settings ───────────────────────────── */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">Step 3 — Sync settings</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Turn on sync once your mappings look right. The start date is the floor — timesheets before it are
                    ignored.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <Label htmlFor="deputy-sync-enabled" className="text-sm font-medium">
                      Sync enabled
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When off, scheduled and manual syncs are skipped.
                    </p>
                  </div>
                  <Switch
                    id="deputy-sync-enabled"
                    checked={syncEnabled}
                    disabled={savingSettings}
                    onCheckedChange={(checked) => updateSyncSettings({ sync_enabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Sync data from</Label>
                    <p className="text-xs text-muted-foreground">
                      Timesheets before this date are ignored even if Deputy returns them.
                    </p>
                  </div>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-[180px] justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {startDate ? format(startDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(d) => {
                          if (d) {
                            updateSyncSettings({ sync_start_date: format(d, "yyyy-MM-dd") });
                            setDatePickerOpen(false);
                          }
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* ── Action buttons ───────────────────────────────────── */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button onClick={handleSync} disabled={syncing || !!syncDisabledReason}>
                        {syncing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sync Now
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {syncDisabledReason && <TooltipContent>{syncDisabledReason}</TooltipContent>}
                </Tooltip>
                <Button variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Beaker className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive ml-auto"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  <Unplug className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>

              {testResult && (
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronDown className="h-3 w-3" />
                    Test connection response
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div
                      className="text-xs rounded p-3 mt-2 border"
                      style={{
                        backgroundColor: testResult.ok
                          ? `hsl(var(--status-complete-bg))`
                          : `hsl(var(--status-missing-bg))`,
                        borderColor: testResult.ok
                          ? `hsl(var(--status-complete) / 0.3)`
                          : `hsl(var(--status-missing) / 0.3)`,
                      }}
                    >
                      <pre className="whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(testResult, null, 2)}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Deputy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Deputy connection. Staff will no longer be auto-excused based on attendance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function PreviewPanel({ data }: { data: any }) {
  const employees: any[] = data?.employee_sample ?? [];
  const timesheets: any[] = data?.timesheet_sample ?? [];
  const absent: string[] = data?.absent_all_week_sample ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <PreviewStat label="Employees seen" value={data?.employee_count ?? 0} />
        <PreviewStat label="Timesheets (7d)" value={data?.timesheet_count ?? 0} />
        <PreviewStat label="Absent all week" value={data?.absent_all_week_count ?? 0} />
      </div>

      {employees.length > 0 && (
        <div className="text-xs">
          <p className="font-medium mb-1 text-muted-foreground">Sample employees</p>
          <ul className="space-y-1 bg-background rounded border p-2">
            {employees.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{e.display_name}</span>
                <span className="text-muted-foreground font-mono">#{e.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {timesheets.length > 0 && (
        <div className="text-xs">
          <p className="font-medium mb-1 text-muted-foreground">Sample timesheets</p>
          <ul className="space-y-1 bg-background rounded border p-2">
            {timesheets.map((t, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{t.employee_name}</span>
                <span className="text-muted-foreground">
                  {t.start ? new Date(t.start).toLocaleString() : "—"} ·{" "}
                  {t.total_hours != null ? `${Number(t.total_hours).toFixed(1)}h` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {absent.length > 0 && (
        <div className="text-xs">
          <p className="font-medium mb-1 text-muted-foreground">
            Would be marked absent (based on existing mappings)
          </p>
          <ul className="space-y-1 bg-background rounded border p-2">
            {absent.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronDown className="h-3 w-3" />
          View raw response
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="text-2xs rounded p-2 mt-2 border bg-background whitespace-pre-wrap break-all font-mono max-h-64 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-background p-2 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const isSuccess = status === "success" || status === "ok";
  const isError = status === "error" || status === "failed";

  if (isSuccess) {
    return (
      <Badge
        className="border-0"
        style={{
          backgroundColor: `hsl(var(--status-complete-bg))`,
          color: `hsl(var(--status-complete))`,
        }}
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Success
      </Badge>
    );
  }
  if (isError) {
    return (
      <Badge
        className="border-0"
        style={{
          backgroundColor: `hsl(var(--status-missing-bg))`,
          color: `hsl(var(--status-missing))`,
        }}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}
