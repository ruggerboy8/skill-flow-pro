import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, AlertTriangle, Check, X, RotateCcw, Loader2 } from "lucide-react";
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

  const needsReviewCount = useMemo(
    () => mappings.filter((m) => !m.is_confirmed && !m.is_ignored && m.staff_id).length,
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
    } catch (err: any) {
      toast.error("Update failed", { description: err?.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Employee Mappings</CardTitle>
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3 mt-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Only confirmed mappings trigger automatic excusals. Run a sync first to populate this list.</span>
        </div>
        {needsReviewCount > 0 && (
          <div
            className="flex items-start gap-2 text-sm rounded-md p-3 mt-2 border"
            style={{
              backgroundColor: `hsl(var(--status-pending-bg))`,
              borderColor: `hsl(var(--status-pending) / 0.3)`,
              color: `hsl(var(--status-pending))`,
            }}
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {needsReviewCount} employee mapping{needsReviewCount === 1 ? "" : "s"} need your review before
              auto-excusals will apply.
            </span>
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
            No employee mappings yet. Run a sync to import staff from Deputy.
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
    return (
      <Badge variant="secondary">Ignored</Badge>
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
      Needs review
    </Badge>
  );
}
