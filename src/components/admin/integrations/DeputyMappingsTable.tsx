import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, AlertTriangle, Check, X, RotateCcw, Loader2, CheckCheck, Download } from "lucide-react";
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

/**
 * Mapping row — anchored to an SFP participant. The Deputy fields are nullable
 * because a participant may exist without a Deputy match yet.
 */
interface Mapping {
  id: string;
  deputy_employee_id: number | null;
  deputy_display_name: string;
  staff_id: string;
  is_confirmed: boolean;
  is_ignored: boolean;
}

interface DeputyOption {
  id: number;
  display_name: string;
  email: string | null;
  position: string | null;
  operational_unit_name: string | null;
}

interface ParticipantStaff {
  id: string;
  name: string;
  email: string | null;
  role_name: string | null;
}

const PLACEHOLDER_NAME = "— not yet matched —";

export function DeputyMappingsTable({ organizationId }: Props) {
  const qc = useQueryClient();
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deputyRoster, setDeputyRoster] = useState<DeputyOption[]>([]);

  // ── 1. Load all SFP participants for this org ───────────────────────────
  const { data: participants = [], isLoading: participantsLoading } = useQuery({
    queryKey: ["org-participants-for-deputy", organizationId],
    queryFn: async (): Promise<ParticipantStaff[]> => {
      const { data, error } = await (supabase as any)
        .from("staff")
        .select("id, name, email, role_id, roles:fk_staff_role_id(role_name)")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .eq("is_participant", true)
        .order("name");
      if (error) {
        // Fallback if the join hint doesn't resolve (older deployments)
        const { data: fallback, error: e2 } = await (supabase as any)
          .from("staff")
          .select("id, name, email")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .eq("is_participant", true)
          .order("name");
        if (e2) throw e2;
        return (fallback ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          email: s.email ?? null,
          role_name: null,
        }));
      }
      return (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email ?? null,
        role_name: s.roles?.role_name ?? null,
      }));
    },
  });

  // ── 2. Load existing mapping rows ────────────────────────────────────────
  const { data: mappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ["deputy-mappings", organizationId],
    queryFn: async (): Promise<Mapping[]> => {
      const { data, error } = await (supabase as any)
        .from("deputy_employee_mappings")
        .select("id, deputy_employee_id, deputy_display_name, staff_id, is_confirmed, is_ignored")
        .eq("organization_id", organizationId)
        .not("staff_id", "is", null);
      if (error) throw error;
      return (data ?? []) as Mapping[];
    },
  });

  // Index mappings by staff_id for quick lookup. Should be at most one per staff.
  const mappingByStaff = useMemo(() => {
    const m = new Map<string, Mapping>();
    for (const row of mappings) m.set(row.staff_id, row);
    return m;
  }, [mappings]);

  // Set of Deputy employee IDs already linked to *another* participant — used
  // to gray-out / forbid duplicate selection in dropdowns.
  const claimedDeputyIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of mappings) {
      if (m.deputy_employee_id != null) s.add(m.deputy_employee_id);
    }
    return s;
  }, [mappings]);

  // Deputy roster lookup helpers
  const deputyById = useMemo(() => {
    const m = new Map<number, DeputyOption>();
    for (const d of deputyRoster) m.set(d.id, d);
    return m;
  }, [deputyRoster]);

  // ── 3. Counts for the header chips ───────────────────────────────────────
  const counts = useMemo(() => {
    let confirmed = 0, needsReview = 0, unmatched = 0, ignored = 0, missingMapping = 0;
    for (const p of participants) {
      const m = mappingByStaff.get(p.id);
      if (!m) {
        missingMapping++;
        continue;
      }
      if (m.is_ignored) ignored++;
      else if (m.is_confirmed) confirmed++;
      else if (m.deputy_employee_id != null) needsReview++;
      else unmatched++;
    }
    return { confirmed, needsReview, unmatched, ignored, missingMapping };
  }, [participants, mappingByStaff]);

  const suggestedToConfirm = useMemo(
    () =>
      participants
        .map((p) => mappingByStaff.get(p.id))
        .filter(
          (m): m is Mapping =>
            !!m && !m.is_confirmed && !m.is_ignored && m.deputy_employee_id != null
        ),
    [participants, mappingByStaff]
  );

  // ── Mutations ────────────────────────────────────────────────────────────
  const upsertMapping = async (
    staffId: string,
    patch: Partial<Mapping> & { deputy_employee_id?: number | null; deputy_display_name?: string }
  ) => {
    try {
      const existing = mappingByStaff.get(staffId);
      if (existing) {
        const { error } = await (supabase as any)
          .from("deputy_employee_mappings")
          .update(patch as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("deputy_employee_mappings")
          .insert({
            organization_id: organizationId,
            staff_id: staffId,
            deputy_employee_id: patch.deputy_employee_id ?? null,
            deputy_display_name: patch.deputy_display_name ?? PLACEHOLDER_NAME,
            is_confirmed: patch.is_confirmed ?? false,
            is_ignored: patch.is_ignored ?? false,
          });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings-needs-review", organizationId] });
    } catch (err: any) {
      toast.error("Update failed", { description: err?.message });
    }
  };

  const handleSelectDeputy = (staffId: string, value: string) => {
    if (value === "__none") {
      upsertMapping(staffId, {
        deputy_employee_id: null,
        deputy_display_name: PLACEHOLDER_NAME,
        is_confirmed: false,
      });
      return;
    }
    const empId = Number(value);
    const opt = deputyById.get(empId);
    upsertMapping(staffId, {
      deputy_employee_id: empId,
      deputy_display_name: opt?.display_name ?? `Employee ${empId}`,
      is_confirmed: false,
    });
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

  /**
   * Pull Deputy roster + create/refresh mapping rows for any participant who
   * doesn't already have one. Returns the enriched roster used to populate the
   * dropdown. Safe to re-run; idempotent.
   */
  const handleRefreshRoster = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-sync", {
        body: { dry_run: false, employees_only: true },
      });
      if (error) throw error;
      const roster: DeputyOption[] = (data?.deputy_employees ?? []) as DeputyOption[];
      setDeputyRoster(roster);
      toast.success(
        `Pulled ${roster.length} Deputy employees`,
        {
          description: `${data?.new_mappings_created ?? 0} new participant row${
            data?.new_mappings_created === 1 ? "" : "s"
          } · ${data?.auto_suggested ?? 0} auto-suggested match${
            data?.auto_suggested === 1 ? "" : "es"
          }`,
        }
      );
      qc.invalidateQueries({ queryKey: ["deputy-mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["deputy-mappings-needs-review", organizationId] });
    } catch (err: any) {
      toast.error("Failed to pull Deputy roster", { description: err?.message });
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = participantsLoading || mappingsLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg">Participant ↔ Deputy Mappings</CardTitle>
          <Button size="sm" variant="outline" onClick={handleRefreshRoster} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Pull Deputy Roster
          </Button>
        </div>

        {participants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs mt-2">
            <CountChip label="Confirmed" value={counts.confirmed} tone="complete" />
            <CountChip label="Suggested" value={counts.needsReview} tone="pending" />
            <CountChip label="No match" value={counts.unmatched + counts.missingMapping} tone="missing" />
            <CountChip label="Ignored" value={counts.ignored} tone="muted" />
          </div>
        )}

        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3 mt-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            One row per Pro Moves participant. Pick each person's matching Deputy employee — only
            confirmed mappings drive automatic excusals. Click <span className="font-medium">Pull Deputy Roster</span>
            {" "}first to populate the dropdown options.
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
        ) : participants.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No active Pro Moves participants in this organization yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Deputy match</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => {
                const m = mappingByStaff.get(p.id);
                const deputyOpt =
                  m?.deputy_employee_id != null ? deputyById.get(m.deputy_employee_id) : null;

                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-2xs text-muted-foreground">
                        {p.role_name ?? "—"}
                        {p.email ? ` · ${p.email}` : ""}
                      </div>
                    </TableCell>

                    <TableCell>
                      <DeputySelect
                        currentDeputyId={m?.deputy_employee_id ?? null}
                        currentDisplayName={m?.deputy_display_name ?? null}
                        roster={deputyRoster}
                        claimedDeputyIds={claimedDeputyIds}
                        rosterLoaded={deputyRoster.length > 0}
                        onChange={(value) => handleSelectDeputy(p.id, value)}
                        disabled={!!m?.is_ignored}
                      />
                      {deputyOpt && (
                        <div className="text-2xs text-muted-foreground mt-1">
                          {[deputyOpt.position, deputyOpt.operational_unit_name]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <StatusPill mapping={m ?? null} />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {m && !m.is_ignored && !m.is_confirmed && m.deputy_employee_id != null && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => upsertMapping(p.id, { is_confirmed: true })}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Confirm
                          </Button>
                        )}
                        {m && !m.is_ignored && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => upsertMapping(p.id, { is_ignored: true })}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ignore
                          </Button>
                        )}
                        {m && m.is_confirmed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => upsertMapping(p.id, { is_confirmed: false })}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Unconfirm
                          </Button>
                        )}
                        {m && m.is_ignored && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              upsertMapping(p.id, { is_ignored: false, is_confirmed: false })
                            }
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function DeputySelect({
  currentDeputyId,
  currentDisplayName,
  roster,
  claimedDeputyIds,
  rosterLoaded,
  onChange,
  disabled,
}: {
  currentDeputyId: number | null;
  currentDisplayName: string | null;
  roster: DeputyOption[];
  claimedDeputyIds: Set<number>;
  rosterLoaded: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const value = currentDeputyId != null ? String(currentDeputyId) : "__none";

  // Always include the currently-selected deputy (even if not in fresh roster)
  // so the select doesn't go blank between roster pulls.
  const fallbackCurrent =
    currentDeputyId != null && !roster.find((d) => d.id === currentDeputyId)
      ? {
          id: currentDeputyId,
          display_name: currentDisplayName ?? `Employee ${currentDeputyId}`,
          email: null,
          position: null,
          operational_unit_name: null,
        }
      : null;

  const options = fallbackCurrent ? [fallbackCurrent, ...roster] : roster;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-[280px]">
        <SelectValue
          placeholder={rosterLoaded ? "Select Deputy employee" : "Pull roster to load options"}
        />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        <SelectItem value="__none">— No Deputy match —</SelectItem>
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No Deputy roster loaded yet.
          </div>
        )}
        {options
          .slice()
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
          .map((d) => {
            const isClaimedByOther =
              claimedDeputyIds.has(d.id) && d.id !== currentDeputyId;
            const detail = [d.position, d.operational_unit_name].filter(Boolean).join(" · ");
            return (
              <SelectItem key={d.id} value={String(d.id)} disabled={isClaimedByOther}>
                <div className="flex flex-col">
                  <span>
                    {d.display_name}
                    {isClaimedByOther && (
                      <span className="ml-1 text-2xs text-muted-foreground">(already linked)</span>
                    )}
                  </span>
                  {detail && (
                    <span className="text-2xs text-muted-foreground">{detail}</span>
                  )}
                </div>
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
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

function StatusPill({ mapping }: { mapping: Mapping | null }) {
  if (!mapping) {
    return (
      <Badge
        className="border-0"
        style={{
          backgroundColor: `hsl(var(--status-missing-bg))`,
          color: `hsl(var(--status-missing))`,
        }}
      >
        No row
      </Badge>
    );
  }
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
  if (mapping.deputy_employee_id == null) {
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
