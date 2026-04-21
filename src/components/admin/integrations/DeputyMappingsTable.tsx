import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, AlertTriangle, Check, X, RotateCcw, Loader2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  organizationId: string;
}

interface Mapping {
  id: string;
  deputy_employee_id: number;
  deputy_display_name: string;
  staff_id: string | null;
  is_confirmed: boolean;
  is_ignored: boolean;
}

interface StaffOption {
  id: string;
  name: string;
}

export function DeputyMappingsTable({ organizationId }: Props) {
  const qc = useQueryClient();
  const [bulkConfirming, setBulkConfirming] = useState(false);

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["deputy-mappings", organizationId],
    queryFn: async (): Promise<Mapping[]> => {
      const { data, error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .select("id, deputy_employee_id, deputy_display_name, staff_id, is_confirmed, is_ignored")
        .eq("organization_id", organizationId)
        .order("is_confirmed", { ascending: true })
        .order("deputy_display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mapping[];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["org-staff-for-mapping", organizationId],
    queryFn: async (): Promise<StaffOption[]> => {
      const { data, error } = await (supabase as any)
        .from("staff")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .eq("is_participant", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StaffOption[];
    },
  });

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [staff]);

  const counts = useMemo(() => {
    let confirmed = 0,
      needsReview = 0,
      ignored = 0,
      unmatched = 0;
    for (const m of mappings) {
      if (m.is_ignored) ignored++;
      else if (m.is_confirmed) confirmed++;
      else if (m.staff_id) needsReview++;
      else unmatched++;
    }
    return { confirmed, needsReview, ignored, unmatched };
  }, [mappings]);

  const suggestedToConfirm = useMemo(
    () => mappings.filter((m) => !m.is_confirmed && !m.is_ignored && m.staff_id),
    [mappings]
  );

  const updateMapping = async (id: string, patch: Partial<Mapping>) => {
    try {
      const { error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings-needs-review", organizationId] });
    } catch (err: any) {
      toast.error("Update failed", { description: err?.message });
    }
  };

  const handleBulkConfirm = async () => {
    if (suggestedToConfirm.length === 0) return;
    setBulkConfirming(true);
    try {
      const ids = suggestedToConfirm.map((m) => m.id);
      const { error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .update({ is_confirmed: true })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Confirmed ${ids.length} mapping${ids.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings-needs-review", organizationId] });
    } catch (err: any) {
      toast.error("Bulk confirm failed", { description: err?.message });
    } finally {
      setBulkConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg">Employee Mappings</CardTitle>
          {mappings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <CountChip label="Confirmed" value={counts.confirmed} tone="complete" />
              <CountChip label="Need review" value={counts.needsReview} tone="pending" />
              <CountChip label="Unmatched" value={counts.unmatched} tone="missing" />
              <CountChip label="Ignored" value={counts.ignored} tone="muted" />
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3 mt-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Only confirmed mappings trigger automatic excusals. Auto-suggested matches are pre-selected — review and
            confirm them below.
          </span>
        </div>
        {counts.needsReview > 0 && (
          <div
            className="flex items-start justify-between gap-3 text-sm rounded-md p-3 mt-2 border flex-wrap"
            style={{
              backgroundColor: `hsl(var(--status-pending-bg))`,
              borderColor: `hsl(var(--status-pending) / 0.3)`,
              color: `hsl(var(--status-pending))`,
            }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {counts.needsReview} suggested mapping{counts.needsReview === 1 ? "" : "s"} ready to confirm.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleBulkConfirm} disabled={bulkConfirming}>
              {bulkConfirming ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4 mr-1" />
              )}
              Confirm All Suggested
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No employee mappings yet. Use “Import Deputy Employees” above to pull the active roster.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deputy Name</TableHead>
                <TableHead>Matched Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.deputy_display_name}</TableCell>
                  <TableCell>
                    {m.is_ignored ? (
                      <span className="text-muted-foreground italic">Ignored</span>
                    ) : m.staff_id ? (
                      staffNameById.get(m.staff_id) ?? (
                        <span className="text-muted-foreground italic">Unknown staff</span>
                      )
                    ) : (
                      <span className="text-destructive">No match found</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill mapping={m} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {!m.is_ignored && !m.is_confirmed && m.staff_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMapping(m.id, { is_confirmed: true })}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Confirm
                        </Button>
                      )}
                      {!m.is_ignored && !m.is_confirmed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateMapping(m.id, { is_ignored: true })}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Ignore
                        </Button>
                      )}
                      {m.is_confirmed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateMapping(m.id, { is_confirmed: false })}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Unconfirm
                        </Button>
                      )}
                      {m.is_ignored && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateMapping(m.id, { is_ignored: false, is_confirmed: false })
                          }
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Unignore
                        </Button>
                      )}
                      {!m.is_ignored && (
                        <Select
                          value={m.staff_id ?? "__none"}
                          onValueChange={(v) =>
                            updateMapping(m.id, {
                              staff_id: v === "__none" ? null : v,
                              is_confirmed: false,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-[200px]">
                            <SelectValue placeholder="Change match" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— No match —</SelectItem>
                            {staff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "complete" | "pending" | "missing" | "muted";
}) {
  if (tone === "muted") {
    return (
      <Badge variant="secondary">
        {value} {label}
      </Badge>
    );
  }
  return (
    <Badge
      className="border-0"
      style={{
        backgroundColor: `hsl(var(--status-${tone}-bg))`,
        color: `hsl(var(--status-${tone}))`,
      }}
    >
      {value} {label}
    </Badge>
  );
}

function StatusPill({ mapping }: { mapping: Mapping }) {
  if (mapping.is_confirmed) {
    return (
      <Badge
        className="border-0"
        style={{
          backgroundColor: `hsl(var(--status-complete-bg))`,
          color: `hsl(var(--status-complete))`,
        }}
      >
        Confirmed
      </Badge>
    );
  }
  if (mapping.is_ignored) {
    return <Badge variant="secondary">Ignored</Badge>;
  }
  if (!mapping.staff_id) {
    return (
      <Badge
        className="border-0"
        style={{
          backgroundColor: `hsl(var(--status-missing-bg))`,
          color: `hsl(var(--status-missing))`,
        }}
      >
        Unmatched
      </Badge>
    );
  }
  return (
    <Badge
      className="border-0"
      style={{
        backgroundColor: `hsl(var(--status-pending-bg))`,
        color: `hsl(var(--status-pending))`,
      }}
    >
      Suggested
    </Badge>
  );
}
