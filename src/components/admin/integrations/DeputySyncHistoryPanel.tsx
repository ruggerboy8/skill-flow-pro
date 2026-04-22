// Sync history panel — shows the last 20 deputy_sync_runs for an org.
// Extracted from DeputyWizard so it can also live in the always-on dashboard.

import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ListChecks, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  organizationId: string;
}

export function DeputySyncHistoryPanel({ organizationId }: Props) {
  const { data: runs, isLoading } = useQuery({
    queryKey: ["deputy-sync-runs", organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deputy_sync_runs")
        .select(
          "id, mode, trigger, week_start, week_end, status, excusals_inserted, excusals_already_existed, mapped_participant_count, error_message, started_at, finished_at",
        )
        .eq("organization_id", organizationId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Sync history
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Last 20 runs (manual + scheduled). Refreshes every 30 seconds.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !runs || runs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Excusals</TableHead>
                  <TableHead className="text-right">Already&nbsp;existed</TableHead>
                  <TableHead className="text-right">Participants</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs">{r.mode}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={r.trigger === "cron" ? "secondary" : "outline"}>{r.trigger}</Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.week_start ? format(new Date(r.week_start), "MMM d") : "—"}
                      {r.week_end ? ` → ${format(new Date(r.week_end), "MMM d")}` : ""}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {r.excusals_inserted ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.excusals_already_existed ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.mapped_participant_count ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <CheckCircle2 className="h-3 w-3" /> success
                        </span>
                      ) : r.status === "running" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> running
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1" title={r.error_message ?? undefined}>
                          <XCircle className="h-3 w-3" /> {r.status}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
