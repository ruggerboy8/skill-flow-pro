// Deputy Integration tab — "always-on dashboard" view.
//
// Once Deputy is connected, this tab defaults to a status dashboard:
//   • Connection health (host, last sync, auto-sync toggle)
//   • Unmapped staff alert (only when there are gaps)
//   • Inline staff-mapping panel (full table, same UX as Step 1 of the wizard)
//   • Sync history (last 20 runs)
//
// The 4-step setup wizard is still available behind a "Run setup wizard"
// toggle for the rare cases where an admin wants to re-run preview/verify or
// apply historical excusals.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings2,
  Unplug,
  Users,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { DeputyWizard } from "./integrations/DeputyWizard";
import { DeputyMappingPanel } from "./integrations/DeputyMappingPanel";
import { DeputySyncHistoryPanel } from "./integrations/DeputySyncHistoryPanel";

interface ConnectionInfo {
  deputy_install: string;
  deputy_region: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  auto_sync_enabled: boolean;
}

export function AdminIntegrationsTab() {
  const { organizationId } = useUserRole();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // OAuth callback toast + URL cleanup
  useEffect(() => {
    const deputyParam = searchParams.get("deputy");
    if (!deputyParam) return;
    if (deputyParam === "connected") toast.success("Deputy connected successfully");
    else if (deputyParam === "error") {
      const reason = searchParams.get("reason") ?? "unknown_error";
      toast.error("Deputy connection failed", { description: reason.replace(/_/g, " ") });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("deputy");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["deputy-connection", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ConnectionInfo | null> => {
      const { data, error } = await (supabase as any)
        .from("deputy_connections")
        .select(
          "deputy_install, deputy_region, last_sync_at, last_sync_status, last_sync_error, auto_sync_enabled",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as ConnectionInfo) ?? null;
    },
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

  const toggleAutoSync = async (next: boolean) => {
    if (!organizationId) return;
    setSavingToggle(true);
    try {
      const { error } = await (supabase as any)
        .from("deputy_connections")
        .update({ auto_sync_enabled: next })
        .eq("organization_id", organizationId);
      if (error) throw error;
      toast.success(next ? "Auto-sync enabled" : "Auto-sync disabled");
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
    } catch (err: any) {
      toast.error("Failed to update", { description: err?.message });
    } finally {
      setSavingToggle(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organizationId) return;
    try {
      const { error } = await (supabase as any)
        .from("deputy_connections")
        .delete()
        .eq("organization_id", organizationId);
      if (error) throw error;
      toast.success("Deputy disconnected");
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
    } catch (err: any) {
      toast.error("Disconnect failed", { description: err?.message });
    } finally {
      setConfirmDisconnect(false);
    }
  };

  if (!organizationId) {
    return (
      <p className="text-sm text-muted-foreground">
        No organization context — integrations require an organization assignment.
      </p>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Not connected → invite to connect
  if (!connection) {
    return (
      <Card>
        <CardHeader>
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
        </CardHeader>
        <CardContent>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Connect Deputy
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Wizard mode — render the original 4-step flow with a back button
  if (showWizard) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setShowWizard(false)}>
            ← Back to dashboard
          </Button>
          <p className="text-xs text-muted-foreground">
            Setup wizard mode — useful when retesting or applying historical excusals.
          </p>
        </div>
        <DeputyWizard organizationId={organizationId} />
      </div>
    );
  }

  // Default: dashboard view
  return (
    <div className="space-y-4">
      {/* ── Connection health header ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Deputy connected</CardTitle>
                <Badge
                  className="border-0"
                  style={{
                    backgroundColor: `hsl(var(--status-complete-bg))`,
                    color: `hsl(var(--status-complete))`,
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Live
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {connection.deputy_install}.{connection.deputy_region}.deputy.com
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last sync:{" "}
                {connection.last_sync_at
                  ? formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })
                  : "never"}
                {connection.last_sync_status && (
                  <>
                    {" · "}
                    {connection.last_sync_status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <CheckCircle2 className="h-3 w-3" /> success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <XCircle className="h-3 w-3" /> {connection.last_sync_status}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
                <Settings2 className="h-4 w-4 mr-1.5" />
                Run setup wizard
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                <Unplug className="h-4 w-4 mr-1.5" />
                Disconnect
              </Button>
            </div>
          </div>
          {connection.last_sync_error && (
            <p className="text-xs bg-muted/50 rounded p-2 mt-2 text-muted-foreground">
              {connection.last_sync_error}
            </p>
          )}
        </CardHeader>

        {/* Auto-sync row */}
        <CardContent className="pt-0">
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border p-3">
            <div className="flex items-start gap-2">
              <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Automatic weekly sync</div>
                <div className="text-xs text-muted-foreground">
                  Runs every Monday at 3:00 AM Central and creates excusals for the previous week (Mon–Sun).
                </div>
              </div>
            </div>
            <Switch
              checked={connection.auto_sync_enabled}
              disabled={savingToggle}
              onCheckedChange={toggleAutoSync}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Mapping panel (drives its own unmapped alert internally) ── */}
      <DeputyMappingPanel organizationId={organizationId} />

      {/* ── Sync history ── */}
      <DeputySyncHistoryPanel organizationId={organizationId} />

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Deputy?</AlertDialogTitle>
            <AlertDialogDescription>
              Stops automatic excusals. Existing excusals stay in place. Mappings are preserved so reconnecting
              brings them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
