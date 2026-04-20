import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Plug, RefreshCw, Loader2, Unplug, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}

export function DeputyConnectionCard({ organizationId }: Props) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["deputy-connection", organizationId],
    queryFn: async (): Promise<DeputyConnection | null> => {
      const { data, error } = await (supabase as any)
        .from("deputy_connections")
        .select("deputy_install, deputy_region, last_sync_at, last_sync_status, last_sync_error")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data as DeputyConnection | null;
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-sync", { body: {} });
      if (error) throw error;
      const excused = data?.staff_absent_all_week ?? data?.excused_count ?? 0;
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

  return (
    <>
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
            <div className="space-y-4">
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

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSync} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  <Unplug className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
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
    </>
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
