// Standalone Deputy ↔ SFP staff mapping panel.
//
// Used as the "always-on" mapping management UI in the integrations dashboard.
// Mirrors the behavior of Step 1 of the wizard but works independently:
//   • Loads the Deputy roster on mount
//   • Auto-suggests matches for any unresolved participants
//   • Surfaces an inline "Unmapped staff" alert at the top when there are gaps
//   • Lets admins confirm / change / ignore mappings inline
//
// Note: the wizard still has its own Step 1 implementation. This component is
// for ongoing maintenance, not first-time setup.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
} from "lucide-react";
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
import {
  type DeputyEmployee,
  suggestEmployee,
} from "@/lib/deputyMatching";

interface Props {
  organizationId: string;
}

interface Mapping {
  id: string;
  staff_id: string;
  deputy_employee_id: number | null;
  deputy_display_name: string;
  is_confirmed: boolean;
  is_ignored: boolean;
}

interface Participant {
  id: string;
  name: string;
  email: string | null;
}

const PLACEHOLDER = "— not yet matched —";

export function DeputyMappingPanel({ organizationId }: Props) {
  const qc = useQueryClient();

  const { data: participants = [], isLoading: partLoading } = useQuery({
    queryKey: ["deputy-participants", organizationId],
    queryFn: async (): Promise<Participant[]> => {
      const { data, error } = await (supabase as any)
        .from("staff")
        .select("id, name, email")
        .eq("organization_id", organizationId)
        .eq("is_participant", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Participant[];
    },
  });

  const { data: mappings = [], isLoading: mapLoading } = useQuery({
    queryKey: ["deputy-mappings", organizationId],
    queryFn: async (): Promise<Mapping[]> => {
      const { data, error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .select("id, staff_id, deputy_employee_id, deputy_display_name, is_confirmed, is_ignored")
        .eq("organization_id", organizationId)
        .not("staff_id", "is", null);
      if (error) throw error;
      return (data ?? []) as Mapping[];
    },
  });

  const [roster, setRoster] = useState<DeputyEmployee[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const loadRoster = async () => {
    setLoadingRoster(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-get-employees", { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Roster fetch failed");
      setRoster((data.employees ?? []) as DeputyEmployee[]);
    } catch (err: any) {
      toast.error("Could not load Deputy roster", { description: err?.message });
    } finally {
      setLoadingRoster(false);
    }
  };

  // Auto-load roster once on mount
  useEffect(() => {
    if (roster.length === 0 && !loadingRoster) void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mappingByStaff = useMemo(() => {
    const m = new Map<string, Mapping>();
    for (const row of mappings) m.set(row.staff_id, row);
    return m;
  }, [mappings]);

  const claimedDeputyIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of mappings) if (m.deputy_employee_id != null) s.add(m.deputy_employee_id);
    return s;
  }, [mappings]);

  const employeeById = useMemo(() => {
    const m = new Map<number, DeputyEmployee>();
    for (const e of roster) m.set(e.deputy_employee_id, e);
    return m;
  }, [roster]);

  const counts = useMemo(() => {
    let resolved = 0; // confirmed OR ignored
    let suggested = 0;
    let unmatched = 0;
    for (const p of participants) {
      const m = mappingByStaff.get(p.id);
      if (m?.is_ignored || m?.is_confirmed) resolved++;
      else if (m?.deputy_employee_id != null) suggested++;
      else unmatched++;
    }
    return { resolved, suggested, unmatched };
  }, [participants, mappingByStaff]);

  const unmappedCount = counts.suggested + counts.unmatched;

  // Mapping mutation — same logic as the wizard, includes optimistic update.
  const upsertMapping = async (
    staffId: string,
    patch: Partial<Mapping> & { deputy_employee_id?: number | null; deputy_display_name?: string },
  ) => {
    const queryKey = ["deputy-mappings", organizationId];
    const previous = qc.getQueryData<Mapping[]>(queryKey) ?? [];
    const existing = previous.find((m) => m.staff_id === staffId);

    const optimistic: Mapping[] = existing
      ? previous.map((m) =>
          m.staff_id === staffId
            ? {
                ...m,
                ...patch,
                deputy_employee_id:
                  patch.deputy_employee_id !== undefined ? patch.deputy_employee_id : m.deputy_employee_id,
                deputy_display_name: patch.deputy_display_name ?? m.deputy_display_name,
                is_confirmed: patch.is_confirmed ?? m.is_confirmed,
                is_ignored: patch.is_ignored ?? m.is_ignored,
              }
            : m,
        )
      : [
          ...previous,
          {
            id: `optimistic-${staffId}`,
            staff_id: staffId,
            deputy_employee_id: patch.deputy_employee_id ?? null,
            deputy_display_name: patch.deputy_display_name ?? PLACEHOLDER,
            is_confirmed: patch.is_confirmed ?? false,
            is_ignored: patch.is_ignored ?? false,
          },
        ];
    qc.setQueryData(queryKey, optimistic);

    try {
      const newDeputyId = patch.deputy_employee_id;
      if (newDeputyId != null && (!existing || existing.deputy_employee_id !== newDeputyId)) {
        const { data: conflict, error: lookupErr } = await (supabase as any)
          .from("deputy_employee_mappings")
          .select("id, staff_id")
          .eq("organization_id", organizationId)
          .eq("deputy_employee_id", newDeputyId)
          .maybeSingle();
        if (lookupErr) throw lookupErr;
        if (conflict && conflict.staff_id !== staffId) {
          const { error: delErr } = await (supabase as any)
            .from("deputy_employee_mappings")
            .delete()
            .eq("id", conflict.id);
          if (delErr) throw delErr;
        }
      }

      if (existing) {
        const { data: updated, error } = await (supabase as any)
          .from("deputy_employee_mappings")
          .update(patch as any)
          .eq("id", existing.id)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) throw new Error("Update affected 0 rows");
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("deputy_employee_mappings")
          .insert({
            organization_id: organizationId,
            staff_id: staffId,
            deputy_employee_id: patch.deputy_employee_id ?? null,
            deputy_display_name: patch.deputy_display_name ?? PLACEHOLDER,
            is_confirmed: patch.is_confirmed ?? false,
            is_ignored: patch.is_ignored ?? false,
          })
          .select("id");
        if (error) throw error;
        if (!inserted || inserted.length === 0) throw new Error("Insert returned no rows");
      }
      qc.invalidateQueries({ queryKey });
    } catch (err: any) {
      qc.setQueryData(queryKey, previous);
      console.error("[DeputyMappingPanel] upsertMapping failed", { staffId, patch, err });
      toast.error("Update failed", { description: err?.message ?? "Unknown error" });
    }
  };

  const handleAutoSuggestAll = async () => {
    if (roster.length === 0) {
      toast.error("Load Deputy roster first");
      return;
    }
    let suggested = 0;
    const claimed = new Set(claimedDeputyIds);
    for (const p of participants) {
      const existing = mappingByStaff.get(p.id);
      if (existing && (existing.is_confirmed || existing.is_ignored)) continue;
      if (existing?.deputy_employee_id != null) continue;
      const match = suggestEmployee(p, roster);
      if (match && !claimed.has(match.deputy_employee_id)) {
        claimed.add(match.deputy_employee_id);
        await upsertMapping(p.id, {
          deputy_employee_id: match.deputy_employee_id,
          deputy_display_name: match.display_name,
          is_confirmed: false,
          is_ignored: false,
        });
        suggested++;
      }
    }
    toast.success(`Auto-suggested ${suggested} match${suggested === 1 ? "" : "es"}`);
  };

  const handleConfirmAllSuggested = async () => {
    const ids = mappings
      .filter((m) => !m.is_confirmed && !m.is_ignored && m.deputy_employee_id != null)
      .map((m) => m.id);
    if (ids.length === 0) return;
    const { error } = await (supabase as any)
      .from("deputy_employee_mappings")
      .update({ is_confirmed: true })
      .in("id", ids);
    if (error) {
      toast.error("Confirm failed", { description: error.message });
      return;
    }
    toast.success(`Confirmed ${ids.length} mapping${ids.length === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
  };

  const loading = partLoading || mapLoading;

  return (
    <div className="space-y-3">
      {/* Unmapped alert */}
      {!loading && unmappedCount > 0 && (
        <div
          className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm flex-wrap"
          style={{
            backgroundColor: `hsl(var(--status-pending-bg))`,
            borderColor: `hsl(var(--status-pending) / 0.3)`,
            color: `hsl(var(--status-pending))`,
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>
                {unmappedCount} participant{unmappedCount === 1 ? "" : "s"} not yet confirmed
              </strong>
              <div className="text-xs text-muted-foreground mt-0.5">
                {counts.suggested > 0 && <>{counts.suggested} suggested · </>}
                {counts.unmatched > 0 && <>{counts.unmatched} unmatched · </>}
                Auto-sync skips unconfirmed mappings.
              </div>
            </div>
          </div>
          {counts.suggested > 0 && (
            <Button size="sm" variant="outline" onClick={handleConfirmAllSuggested}>
              Confirm all suggested ({counts.suggested})
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Staff mappings
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Each Pro Moves participant must be linked to their Deputy account so the system
                knows whose timesheets to read. Confirmed mappings are used by auto-sync.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={loadRoster} disabled={loadingRoster}>
                {loadingRoster ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Refresh roster
              </Button>
              <Button variant="outline" size="sm" onClick={handleAutoSuggestAll} disabled={roster.length === 0}>
                Auto-suggest unmatched
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs mt-3">
            <CountChip label="Confirmed" value={counts.resolved} tone="complete" />
            <CountChip label="Suggested" value={counts.suggested} tone="pending" />
            <CountChip label="No match" value={counts.unmatched} tone="missing" />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : participants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active Pro Moves participants in this organization.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SFP staff</TableHead>
                  <TableHead>Deputy account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((p) => {
                  const m = mappingByStaff.get(p.id);
                  return (
                    <TableRow key={p.id} className={m?.is_ignored ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.email && <div className="text-2xs text-muted-foreground">{p.email}</div>}
                      </TableCell>
                      <TableCell>
                        <DeputyDropdown
                          currentDeputyId={m?.deputy_employee_id ?? null}
                          currentDisplayName={m?.deputy_display_name ?? null}
                          roster={roster}
                          claimedDeputyIds={claimedDeputyIds}
                          rosterLoaded={roster.length > 0}
                          disabled={!!m?.is_ignored}
                          onChange={(empId) => {
                            if (empId == null) {
                              upsertMapping(p.id, {
                                deputy_employee_id: null,
                                deputy_display_name: PLACEHOLDER,
                                is_confirmed: false,
                              });
                            } else {
                              const opt = employeeById.get(empId);
                              upsertMapping(p.id, {
                                deputy_employee_id: empId,
                                deputy_display_name: opt?.display_name ?? `Employee ${empId}`,
                                is_confirmed: false,
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusPill mapping={m ?? null} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {m && !m.is_ignored && !m.is_confirmed && m.deputy_employee_id != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => upsertMapping(p.id, { is_confirmed: true, is_ignored: false })}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                            </Button>
                          )}
                          {m?.is_confirmed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => upsertMapping(p.id, { is_confirmed: false })}
                            >
                              Unconfirm
                            </Button>
                          )}
                          {!m?.is_ignored ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => upsertMapping(p.id, { is_ignored: true, is_confirmed: false })}
                            >
                              Ignore
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => upsertMapping(p.id, { is_ignored: false, is_confirmed: false })}
                            >
                              Unignore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeputyDropdown({
  currentDeputyId,
  currentDisplayName,
  roster,
  claimedDeputyIds,
  rosterLoaded,
  disabled,
  onChange,
}: {
  currentDeputyId: number | null;
  currentDisplayName: string | null;
  roster: DeputyEmployee[];
  claimedDeputyIds: Set<number>;
  rosterLoaded: boolean;
  disabled?: boolean;
  onChange: (empId: number | null) => void;
}) {
  if (!rosterLoaded) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {currentDisplayName && currentDisplayName !== PLACEHOLDER ? currentDisplayName : "Load roster to pick"}
      </div>
    );
  }
  return (
    <Select
      value={currentDeputyId != null ? String(currentDeputyId) : "__none"}
      onValueChange={(v) => onChange(v === "__none" ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Pick a Deputy employee" />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        <SelectItem value="__none">— No match —</SelectItem>
        {roster.map((e) => {
          const claimed =
            e.deputy_employee_id !== currentDeputyId && claimedDeputyIds.has(e.deputy_employee_id);
          return (
            <SelectItem key={e.deputy_employee_id} value={String(e.deputy_employee_id)} disabled={claimed}>
              <span className={claimed ? "text-muted-foreground" : ""}>
                {e.display_name}
                {!e.active && <span className="text-muted-foreground"> (inactive)</span>}
                {claimed && <span className="text-2xs text-muted-foreground"> · already mapped</span>}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function StatusPill({ mapping }: { mapping: Mapping | null }) {
  if (!mapping) return <Badge variant="outline" className="text-xs">No match</Badge>;
  if (mapping.is_ignored)
    return <Badge variant="outline" className="text-xs text-muted-foreground">Ignored</Badge>;
  if (mapping.is_confirmed) {
    return (
      <Badge
        className="border-0 text-xs"
        style={{ backgroundColor: `hsl(var(--status-complete-bg))`, color: `hsl(var(--status-complete))` }}
      >
        <Check className="h-3 w-3 mr-1" /> Confirmed
      </Badge>
    );
  }
  if (mapping.deputy_employee_id != null) {
    return (
      <Badge
        className="border-0 text-xs"
        style={{ backgroundColor: `hsl(var(--status-pending-bg))`, color: `hsl(var(--status-pending))` }}
      >
        Suggested
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">No match</Badge>;
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "complete" | "pending" | "missing";
}) {
  const styles: Record<string, React.CSSProperties> = {
    complete: { backgroundColor: `hsl(var(--status-complete-bg))`, color: `hsl(var(--status-complete))` },
    pending: { backgroundColor: `hsl(var(--status-pending-bg))`, color: `hsl(var(--status-pending))` },
    missing: { backgroundColor: `hsl(var(--status-missing-bg))`, color: `hsl(var(--status-missing))` },
  };
  return (
    <Badge className="border-0 text-2xs" style={styles[tone]}>
      {label}: {value}
    </Badge>
  );
}
