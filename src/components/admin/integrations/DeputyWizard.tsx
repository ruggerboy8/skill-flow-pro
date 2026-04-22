// Deputy 4-step wizard.
//
// Architecture (matches deputy-sync edge function modes):
//   Step 1 — Map Staff       (no API beyond deputy-get-employees; pure mapping)
//   Step 2 — Verify Data     (deputy-sync mode=preview_data, last 30 days)
//   Step 3 — Preview         (deputy-sync mode=preview_excusals, since program start)
//   Step 4 — Apply & Automate (deputy-sync mode=apply_retroactive + auto_sync_enabled toggle)
//
// Stepper is visual-only: all steps clickable, each step checks its own
// preconditions and shows an inline warning if not met.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Users,
  Eye,
  ListChecks,
  Zap,
  Check,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Unplug,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeputyEmployee {
  deputy_employee_id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  active: boolean;
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

interface Connection {
  deputy_install: string;
  deputy_region: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  auto_sync_enabled: boolean;
}

const PLACEHOLDER = "— not yet matched —";

const STEPS = [
  { id: 1, label: "Map Staff", icon: Users },
  { id: 2, label: "Verify Data", icon: Eye },
  { id: 3, label: "Preview Excusals", icon: ListChecks },
  { id: 4, label: "Apply & Automate", icon: Zap },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

// Credentials & honorifics to strip from display names before comparing.
const CREDENTIAL_RE =
  /\b(dr|drs|prof|mr|mrs|ms|miss|dds|dmd|md|do|phd|rdh|rdha|rda|cda|da|om|oms|fagd|faap|facd|mph|mba|jr|sr|ii|iii|iv)\b\.?/gi;

// Common English nicknames → canonical first name.
const NICKNAMES: Record<string, string> = {
  alex: "alexander", al: "albert", andy: "andrew", tony: "anthony", abby: "abigail",
  ben: "benjamin", bill: "william", billy: "william", bob: "robert", bobby: "robert",
  cathy: "catherine", kathy: "catherine", chris: "christopher", dan: "daniel", danny: "daniel",
  dave: "david", deb: "deborah", debbie: "deborah", don: "donald", ed: "edward",
  eddie: "edward", fred: "frederick", greg: "gregory", jim: "james", jimmy: "james",
  jen: "jennifer", jenny: "jennifer", jess: "jessica", joe: "joseph", joey: "joseph",
  jon: "jonathan", kate: "katherine", katie: "katherine",
  ken: "kenneth", kenny: "kenneth", liz: "elizabeth", beth: "elizabeth", betty: "elizabeth",
  matt: "matthew", mike: "michael", mickey: "michael", nate: "nathan", nick: "nicholas",
  pat: "patrick", patty: "patricia", pete: "peter", rich: "richard", rick: "richard",
  rob: "robert", ron: "ronald", sam: "samuel", steve: "steven", sue: "susan",
  tom: "thomas", tommy: "thomas", will: "william", zach: "zachary",
};

function canonicalToken(t: string): string {
  return NICKNAMES[t] ?? t;
}

function normalizeName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")           // strip diacritics
    .replace(CREDENTIAL_RE, " ")
    .replace(/[.,'’"()_/\\-]/g, " ")           // punctuation → space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(n: string): string[] {
  return normalizeName(n)
    .split(" ")
    .filter((t) => t.length > 1)               // drop initials/empties
    .map(canonicalToken);
}

function suggestEmployee(staff: Participant, roster: DeputyEmployee[]): DeputyEmployee | null {
  // 1) Email exact match
  if (staff.email) {
    const lower = staff.email.toLowerCase().trim();
    const byEmail = roster.find((d) => d.email && d.email.toLowerCase().trim() === lower);
    if (byEmail) return byEmail;
  }

  const sNorm = normalizeName(staff.name);
  const sTokens = tokens(staff.name);
  if (sTokens.length === 0) return null;

  // 2) Exact normalized string match
  const exact = roster.find((d) => normalizeName(d.display_name) === sNorm);
  if (exact) return exact;

  // 3) Canonical token-set equality (handles "Last, First", reordering, nicknames)
  const sSet = new Set(sTokens);
  const tokenEq = roster.find((d) => {
    const dt = new Set(tokens(d.display_name));
    if (dt.size !== sSet.size) return false;
    for (const t of sSet) if (!dt.has(t)) return false;
    return true;
  });
  if (tokenEq) return tokenEq;

  // 4) First + last token both present
  const sFirst = sTokens[0];
  const sLast = sTokens[sTokens.length - 1];
  const firstLast = roster.find((d) => {
    const dt = new Set(tokens(d.display_name));
    return dt.has(sFirst) && dt.has(sLast);
  });
  if (firstLast) return firstLast;

  // 5) Weighted Jaccard fallback (last-name match boosted)
  let best: { d: DeputyEmployee; score: number } | null = null;
  for (const d of roster) {
    const dTokens = tokens(d.display_name);
    if (dTokens.length === 0) continue;
    const dSet = new Set(dTokens);
    let inter = 0;
    for (const t of sSet) if (dSet.has(t)) inter++;
    const union = new Set([...sSet, ...dSet]).size;
    let score = union ? inter / union : 0;
    if (dSet.has(sLast)) score += 0.15;
    if (!best || score > best.score) best = { d, score };
  }
  return best && best.score >= 0.5 ? best.d : null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DeputyWizard({ organizationId }: Props) {
  const qc = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Connection
  const { data: connection, isLoading: connLoading } = useQuery({
    queryKey: ["deputy-connection", organizationId],
    queryFn: async (): Promise<Connection | null> => {
      const { data, error } = await (supabase as any)
        .from("deputy_connections")
        .select("deputy_install, deputy_region, last_sync_at, last_sync_status, last_sync_error, auto_sync_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as Connection) ?? null;
    },
  });

  // Org program start date — used as default retroactive floor
  const { data: orgStartDate } = useQuery({
    queryKey: ["deputy-org-start", organizationId],
    queryFn: async (): Promise<string | null> => {
      const { data: groups } = await (supabase as any)
        .from("practice_groups")
        .select("id")
        .eq("organization_id", organizationId);
      const groupIds = (groups ?? []).map((g: any) => g.id);
      if (groupIds.length === 0) return null;
      const { data: locs } = await (supabase as any)
        .from("locations")
        .select("program_start_date")
        .in("group_id", groupIds)
        .order("program_start_date", { ascending: true })
        .limit(1);
      const first = (locs ?? [])[0];
      return first?.program_start_date ?? null;
    },
  });

  // Participants
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

  // Mappings
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

  // Deputy roster (loaded on demand from Step 1)
  const [roster, setRoster] = useState<DeputyEmployee[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Auto-load roster when entering Step 1 if it's empty
  useEffect(() => {
    if (currentStep === 1 && roster.length === 0 && !loadingRoster && connection) {
      void loadRoster();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, connection]);

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

  // ── Derived data ────────────────────────────────────────────────────────
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

  const allMapped = participants.length > 0 && counts.unmatched === 0 && counts.suggested === 0;

  // ── Mapping mutations ───────────────────────────────────────────────────
  const upsertMapping = async (
    staffId: string,
    patch: Partial<Mapping> & { deputy_employee_id?: number | null; deputy_display_name?: string }
  ) => {
    const queryKey = ["deputy-mappings", organizationId];
    const previous = qc.getQueryData<Mapping[]>(queryKey) ?? [];
    const existing = previous.find((m) => m.staff_id === staffId);

    // Optimistic cache update so the Select trigger reflects the choice instantly.
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
            : m
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
      if (existing) {
        const { data: updated, error } = await (supabase as any)
          .from("deputy_employee_mappings")
          .update(patch as any)
          .eq("id", existing.id)
          .select("id, staff_id, deputy_employee_id, deputy_display_name, is_confirmed, is_ignored");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error("Update silently affected 0 rows (RLS or stale id)");
        }
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
          .select("id, staff_id, deputy_employee_id, deputy_display_name, is_confirmed, is_ignored");
        if (error) throw error;
        if (!inserted || inserted.length === 0) {
          throw new Error("Insert returned no rows (RLS or constraint)");
        }
      }
      qc.invalidateQueries({ queryKey });
    } catch (err: any) {
      // Roll back optimistic update on failure
      qc.setQueryData(queryKey, previous);
      console.error("[DeputyWizard] upsertMapping failed", { staffId, patch, err });
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

  // ── Disconnect ──────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
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

  if (connLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!connection) return null; // parent renders the connect card

  return (
    <div className="space-y-4">
      {/* Header card with connection info + disconnect */}
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
                {connection.last_sync_status && ` · ${connection.last_sync_status}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
              <Unplug className="h-4 w-4 mr-1.5" />
              Disconnect
            </Button>
          </div>
          {connection.last_sync_error && (
            <p className="text-xs bg-muted/50 rounded p-2 mt-2 text-muted-foreground">
              {connection.last_sync_error}
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Stepper */}
      <Stepper currentStep={currentStep} onStepClick={setCurrentStep} />

      {/* Step content */}
      {currentStep === 1 && (
        <Step1Mapping
          participants={participants}
          mappings={mappings}
          mappingByStaff={mappingByStaff}
          claimedDeputyIds={claimedDeputyIds}
          roster={roster}
          loadingRoster={loadingRoster}
          loading={partLoading || mapLoading}
          counts={counts}
          onLoadRoster={loadRoster}
          onSelect={(staffId, empId) => {
            if (empId == null) {
              upsertMapping(staffId, {
                deputy_employee_id: null,
                deputy_display_name: PLACEHOLDER,
                is_confirmed: false,
              });
            } else {
              const opt = employeeById.get(empId);
              upsertMapping(staffId, {
                deputy_employee_id: empId,
                deputy_display_name: opt?.display_name ?? `Employee ${empId}`,
                is_confirmed: false,
              });
            }
          }}
          onConfirm={(staffId) => upsertMapping(staffId, { is_confirmed: true, is_ignored: false })}
          onIgnore={(staffId) => upsertMapping(staffId, { is_ignored: true, is_confirmed: false })}
          onUnconfirm={(staffId) => upsertMapping(staffId, { is_confirmed: false })}
          onUnignore={(staffId) => upsertMapping(staffId, { is_ignored: false, is_confirmed: false })}
          onAutoSuggestAll={handleAutoSuggestAll}
          onConfirmAllSuggested={handleConfirmAllSuggested}
        />
      )}

      {currentStep === 2 && (
        <Step2Verify
          allMapped={allMapped}
          counts={counts}
          onGoToStep1={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 3 && (
        <Step3Preview
          allMapped={allMapped}
          orgStartDate={orgStartDate ?? null}
          onGoToStep1={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 4 && (
        <Step4Apply
          organizationId={organizationId}
          allMapped={allMapped}
          autoSyncEnabled={connection.auto_sync_enabled}
          orgStartDate={orgStartDate ?? null}
          lastSyncAt={connection.last_sync_at}
          lastSyncStatus={connection.last_sync_status}
          onGoToStep1={() => setCurrentStep(1)}
        />
      )}

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

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ currentStep, onStepClick }: { currentStep: number; onStepClick: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isPast = currentStep > step.id;
        return (
          <div key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors whitespace-nowrap",
                isActive && "bg-primary text-primary-foreground border-primary",
                !isActive && isPast && "border-primary/30 text-primary",
                !isActive && !isPast && "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  isActive ? "bg-primary-foreground/20" : isPast ? "bg-primary/20" : "bg-muted"
                )}
              >
                {isPast ? <Check className="h-3 w-3" /> : step.id}
              </span>
              <Icon className="h-3.5 w-3.5" />
              {step.label}
            </button>
            {idx < STEPS.length - 1 && (
              <div className={cn("h-px w-4 sm:w-8", isPast ? "bg-primary/40" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Map Staff ─────────────────────────────────────────────────────

function Step1Mapping(props: {
  participants: Participant[];
  mappings: Mapping[];
  mappingByStaff: Map<string, Mapping>;
  claimedDeputyIds: Set<number>;
  roster: DeputyEmployee[];
  loadingRoster: boolean;
  loading: boolean;
  counts: { resolved: number; suggested: number; unmatched: number };
  onLoadRoster: () => void;
  onSelect: (staffId: string, empId: number | null) => void;
  onConfirm: (staffId: string) => void;
  onIgnore: (staffId: string) => void;
  onUnconfirm: (staffId: string) => void;
  onUnignore: (staffId: string) => void;
  onAutoSuggestAll: () => void;
  onConfirmAllSuggested: () => void;
}) {
  const {
    participants, mappingByStaff, claimedDeputyIds, roster, loadingRoster, loading, counts,
    onLoadRoster, onSelect, onConfirm, onIgnore, onUnconfirm, onUnignore,
    onAutoSuggestAll, onConfirmAllSuggested,
  } = props;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Step 1 — Map staff to Deputy
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              One row per Pro Moves participant. Pick each person's matching Deputy account, or mark them as
              "not in Deputy" to skip them. No timesheet data is touched yet.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onLoadRoster} disabled={loadingRoster}>
              {loadingRoster ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {roster.length > 0 ? "Refresh roster" : "Load Deputy roster"}
            </Button>
            <Button variant="outline" size="sm" onClick={onAutoSuggestAll} disabled={roster.length === 0}>
              Auto-suggest all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirmAllSuggested}
              disabled={counts.suggested === 0}
            >
              Confirm all suggested ({counts.suggested})
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs mt-3">
          <CountChip label="Resolved" value={counts.resolved} tone="complete" />
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
                        onChange={(val) => onSelect(p.id, val)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusPill mapping={m ?? null} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {m && !m.is_ignored && !m.is_confirmed && m.deputy_employee_id != null && (
                          <Button size="sm" variant="outline" onClick={() => onConfirm(p.id)}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                          </Button>
                        )}
                        {m?.is_confirmed && (
                          <Button size="sm" variant="ghost" onClick={() => onUnconfirm(p.id)}>
                            Unconfirm
                          </Button>
                        )}
                        {!m?.is_ignored ? (
                          <Button size="sm" variant="ghost" onClick={() => onIgnore(p.id)}>
                            Ignore
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => onUnignore(p.id)}>
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
          const claimed = e.deputy_employee_id !== currentDeputyId && claimedDeputyIds.has(e.deputy_employee_id);
          return (
            <SelectItem
              key={e.deputy_employee_id}
              value={String(e.deputy_employee_id)}
              disabled={claimed}
            >
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
  if (mapping.is_ignored) return <Badge variant="outline" className="text-xs text-muted-foreground">Ignored</Badge>;
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

function CountChip({ label, value, tone }: { label: string; value: number; tone: "complete" | "pending" | "missing" | "muted" }) {
  const styles: Record<string, React.CSSProperties> = {
    complete: { backgroundColor: `hsl(var(--status-complete-bg))`, color: `hsl(var(--status-complete))` },
    pending: { backgroundColor: `hsl(var(--status-pending-bg))`, color: `hsl(var(--status-pending))` },
    missing: { backgroundColor: `hsl(var(--status-missing-bg))`, color: `hsl(var(--status-missing))` },
    muted: { backgroundColor: `hsl(var(--muted))`, color: `hsl(var(--muted-foreground))` },
  };
  return (
    <Badge className="border-0 text-2xs" style={styles[tone]}>
      {label}: {value}
    </Badge>
  );
}

// ─── Step 2 — Verify Data ───────────────────────────────────────────────────

function Step2Verify({
  allMapped,
  counts,
  onGoToStep1,
}: {
  allMapped: boolean;
  counts: { resolved: number; suggested: number; unmatched: number };
  onGoToStep1: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setData(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { data: res, error } = await supabase.functions.invoke("deputy-sync", {
        body: { mode: "preview_data", start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error ?? "Failed");
      setData(res);
      toast.success(`Pulled ${res.timesheet_count} timesheets`);
    } catch (err: any) {
      toast.error("Verify failed", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" /> Step 2 — Verify Deputy data
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Pulls the last 30 days of shifts for every mapped staff member. Use this to sanity-check that the
          numbers match what you'd expect to see in Deputy.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!allMapped && (
          <PreconditionBanner
            counts={counts}
            onGoToStep1={onGoToStep1}
            message="You can run this with partial mappings, but only mapped + confirmed staff will appear."
          />
        )}
        <Button onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
          Pull last 30 days
        </Button>

        {data && (
          <div className="space-y-3 pt-2">
            <div className="text-sm text-muted-foreground">
              {data.timesheet_count} timesheets across {data.staff?.length ?? 0} mapped staff
              {" · "}
              {data.date_range.start} → {data.date_range.end}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Deputy account</TableHead>
                  <TableHead className="text-right">Shifts</TableHead>
                  <TableHead className="text-right">Weeks active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.staff ?? []).map((s: any) => (
                  <TableRow key={s.staff_id}>
                    <TableCell className="font-medium">{s.staff_name}</TableCell>
                    <TableCell className="text-2xs text-muted-foreground">
                      {s.deputy_display_name}
                      {!s.is_confirmed && (
                        <Badge variant="outline" className="text-2xs ml-2">Unconfirmed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.total_shifts}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.weeks?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {(!data.staff || data.staff.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      No mapped staff with shifts in this window.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 3 — Preview Excusals ──────────────────────────────────────────────

function Step3Preview({
  allMapped,
  orgStartDate,
  onGoToStep1,
}: {
  allMapped: boolean;
  orgStartDate: string | null;
  onGoToStep1: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openStaff, setOpenStaff] = useState<Record<string, boolean>>({});

  const defaultStart = orgStartDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const run = async () => {
    setLoading(true);
    setData(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("deputy-sync", {
        body: { mode: "preview_excusals", start_date: defaultStart, end_date: new Date().toISOString().slice(0, 10) },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error ?? "Failed");
      setData(res);
      toast.success(`${res.total_excusals_would_create} excusals would be created`);
    } catch (err: any) {
      toast.error("Preview failed", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Step 3 — Preview excusals
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Shows what excusal records would be created if we applied the rules to historical data
          {orgStartDate ? ` from ${orgStartDate}` : " (last 90 days)"} through today. Nothing is written.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!allMapped && (
          <PreconditionBanner counts={null} onGoToStep1={onGoToStep1}
            message="Only confirmed mappings are included. Finish Step 1 for full coverage." />
        )}
        <Button onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ListChecks className="h-4 w-4 mr-2" />}
          Run preview
        </Button>

        {data && (
          <div className="space-y-3 pt-2">
            <div
              className="rounded-md p-3 text-sm"
              style={{
                backgroundColor: `hsl(var(--status-pending-bg))`,
                color: `hsl(var(--status-pending))`,
              }}
            >
              <strong>{data.total_excusals_would_create}</strong> excusals would be created across{" "}
              <strong>{data.staff?.length ?? 0}</strong> staff member
              {(data.staff?.length ?? 0) === 1 ? "" : "s"}.{" "}
              <span className="text-muted-foreground">
                {data.total_excusals_already_exist} already exist and won't be duplicated.
              </span>
            </div>

            <div className="space-y-1.5">
              {(data.staff ?? []).map((s: any) => {
                const realCreates = s.excusals_would_create.filter((w: any) => w.action === "create").length;
                const isOpen = !!openStaff[s.staff_id];
                return (
                  <Collapsible
                    key={s.staff_id}
                    open={isOpen}
                    onOpenChange={(o) => setOpenStaff((prev) => ({ ...prev, [s.staff_id]: o }))}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                          />
                          <span className="font-medium">{s.staff_name}</span>
                          <span className="text-2xs text-muted-foreground">{s.deputy_display_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {realCreates} would create · {s.excusals_already_exist} exist
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Week of</TableHead>
                            <TableHead>Metric</TableHead>
                            <TableHead>Days worked</TableHead>
                            <TableHead>Outcome</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {s.excusals_would_create.map((w: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{w.week_of}</TableCell>
                              <TableCell className="capitalize">{w.metric}</TableCell>
                              <TableCell className="text-xs">
                                {w.days_worked.length > 0 ? w.days_worked.join(", ") : <em>none</em>}
                              </TableCell>
                              <TableCell>
                                {w.action === "create" ? (
                                  <Badge
                                    className="border-0 text-2xs"
                                    style={{ backgroundColor: `hsl(var(--status-pending-bg))`, color: `hsl(var(--status-pending))` }}
                                  >
                                    Would create
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-2xs">
                                    Friday extension
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              {(!data.staff || data.staff.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No excusals would be created — every confirmed staff member has full coverage.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 4 — Apply & Automate ──────────────────────────────────────────────

function Step4Apply({
  organizationId,
  allMapped,
  autoSyncEnabled,
  orgStartDate,
  lastSyncAt,
  lastSyncStatus,
  onGoToStep1,
}: {
  organizationId: string;
  allMapped: boolean;
  autoSyncEnabled: boolean;
  orgStartDate: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  onGoToStep1: () => void;
}) {
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const handleApplyRetro = async () => {
    setApplying(true);
    setResult(null);
    try {
      const start = orgStartDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("deputy-sync", {
        body: { mode: "apply_retroactive", start_date: start, end_date: new Date().toISOString().slice(0, 10) },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Apply failed");
      setResult(data);
      toast.success(`Applied — ${data.excusals_inserted} excusal records created`);
      qc.invalidateQueries({ queryKey: ["deputy-connection", organizationId] });
    } catch (err: any) {
      toast.error("Apply failed", { description: err?.message });
    } finally {
      setApplying(false);
    }
  };

  const toggleAutoSync = async (next: boolean) => {
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

  return (
    <div className="space-y-4">
      {/* Section A — Retroactive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> Step 4a — Apply historical excusals
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Walks every week from{" "}
            <strong>{orgStartDate ?? "one year ago"}</strong> to today, creating excusal records based on Deputy
            attendance. Existing excusals are skipped, so this is safe to re-run.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!allMapped && (
            <PreconditionBanner counts={null} onGoToStep1={onGoToStep1}
              message="Only confirmed mappings will be processed." />
          )}
          <Button onClick={handleApplyRetro} disabled={applying}>
            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
            Apply historical excusals
          </Button>
          {result && (
            <div
              className="rounded-md p-3 text-sm space-y-1"
              style={{
                backgroundColor: `hsl(var(--status-complete-bg))`,
                color: `hsl(var(--status-complete))`,
              }}
            >
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                <strong>{result.excusals_inserted}</strong> excusal records created
              </div>
              <div className="text-xs text-muted-foreground">
                {result.excusals_already_existed} already existed (skipped) ·{" "}
                {result.timesheet_count} timesheets scanned ·{" "}
                {result.mapped_participant_count} mapped participants
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B — Auto-sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Step 4b — Automatic weekly sync
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Once enabled, SFP will check Deputy attendance each week and excuse absent staff automatically.
            You can review changes on this page anytime.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Auto-sync</div>
              <div className="text-xs text-muted-foreground">
                When on, the system runs `apply_week` for the previous week every Monday.
              </div>
            </div>
            <Switch
              checked={autoSyncEnabled}
              disabled={savingToggle}
              onCheckedChange={toggleAutoSync}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Last sync:{" "}
            {lastSyncAt ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true }) : "never"}
            {lastSyncStatus && (
              <>
                {" · status: "}
                {lastSyncStatus === "success" ? (
                  <span className="text-foreground inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> success
                  </span>
                ) : (
                  <span className="text-foreground inline-flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> {lastSyncStatus}
                  </span>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreconditionBanner({
  counts,
  message,
  onGoToStep1,
}: {
  counts: { resolved: number; suggested: number; unmatched: number } | null;
  message: string;
  onGoToStep1: () => void;
}) {
  return (
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
          {message}
          {counts && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {counts.suggested} suggested · {counts.unmatched} unmatched
            </div>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onGoToStep1}>
        Back to Step 1
      </Button>
    </div>
  );
}
