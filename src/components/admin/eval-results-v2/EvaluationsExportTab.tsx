import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useRoleDisplayNames } from '@/hooks/useRoleDisplayNames';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StepBar } from '@/components/admin/StepBar';
import { downloadCSV } from '@/lib/csvExport';
import { calculateSubmissionStats } from '@/lib/submissionRateCalc';
import { getPeriodLabel } from '@/types/analytics';
import { toast } from 'sonner';
import {
  Download, ChevronLeft, ChevronRight, AlertTriangle, FileSpreadsheet,
  Users, Building2, MapPin, Loader2,
} from 'lucide-react';
import type { EvalFilters, EvaluationPeriod } from '@/types/analytics';
import type { EvalDistributionRow } from '@/types/evalMetricsV2';
import { EvalPeriodSelector } from '@/components/admin/eval-results-v2/EvalPeriodSelector';
import { formatEvalPeriod } from '@/lib/evalPeriods';
import {
  type ExportConfig, type ExportGrain, type PeriodMode,
  DEFAULT_EXPORT_CONFIG, EXPORT_FORMAT, MAX_EXPORT_ROWS, COLUMN_NAMES,
} from '@/types/exportConfig';

// Calendar-quarter date bounds (Q1 = Jan–Mar, … Q4 = Oct–Dec) for a given year.
// Used to scope participation weeks when exporting "by quarter".
function quarterDateBounds(quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4', year: number): { start: string; end: Date } {
  const startMonth = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }[quarter];
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59)); // last day of the quarter
  return { start: start.toISOString().slice(0, 10), end };
}

// ── Props ──────────────────────────────────────────────────────
interface EvaluationsExportTabProps {
  filters: EvalFilters;
  onFiltersChange: (f: EvalFilters) => void;
}

const STEPS = ['Report Type', 'Scope', 'Metrics', 'Download'];

const GRAIN_OPTIONS: { value: ExportGrain; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'individual', label: 'Individual', description: 'One row per staff member', icon: <Users className="h-5 w-5" /> },
  { value: 'location', label: 'Location', description: 'One row per location (aggregated)', icon: <MapPin className="h-5 w-5" /> },
  { value: 'organization', label: 'Group', description: 'One row per group (aggregated)', icon: <Building2 className="h-5 w-5" /> },
];

interface OrgOption { id: string; name: string; }
interface LocOption { id: string; name: string; group_id: string; }
interface RoleOption { role_id: number; role_name: string; }
interface StaffSubmission {
  completionRate: number | null;
  onTimeRate: number | null;
  expected: number;
  completed: number;
  onTime: number;
  late: number;
  missing: number;
  lastSubmission: string | null;
}

// ── Component ──────────────────────────────────────────────────
export function EvaluationsExportTab({ filters, onFiltersChange }: EvaluationsExportTabProps) {
  const { user } = useAuth();
  const { isSuperAdmin, managedOrgIds, managedLocationIds } = useUserRole();
  const { resolve: resolveRole } = useRoleDisplayNames();

  // Scope boundary: a non-super-admin with coach_scopes may only export within
  // those scopes. RLS already limits reads to the user's organization, but a
  // regional scoped to a *subset* of a multi-group org needs a tighter fence
  // than the org. `managedOrgIds` holds scoped practice_group ids; when a user
  // has no scopes (e.g. a plain org-admin) we fall back to the RLS org view.
  const scopedGroupIds = isSuperAdmin ? null : (managedOrgIds.length > 0 ? managedOrgIds : null);
  const scopedLocationIds = isSuperAdmin ? null : (managedLocationIds.length > 0 ? managedLocationIds : null);
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  const isBaseline = config.periodMode === 'quarter' && filters.evaluationPeriod.type === 'Baseline';
  const hasAnyMetric = config.includeCompletionRate || config.includeOnTimeRate
    || config.includeDomainAverages || config.includeCompetencyAverages;

  const isCustomPeriod = config.periodMode === 'custom';
  // In custom mode a valid range is required (start present, start <= end;
  // a blank end means "through today").
  const customRangeInvalid =
    isCustomPeriod && (
      !config.customStart ||
      (!!config.customEnd && config.customStart > config.customEnd)
    );
  const periodDisplay = isCustomPeriod
    ? `${config.customStart ?? '—'} to ${config.customEnd ?? 'today'}`
    : getPeriodLabel(filters.evaluationPeriod);

  // ── Fetch all active organizations ───────────────────────────
  const { data: allOrgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['export-all-orgs', scopedGroupIds ? [...scopedGroupIds].sort().join(',') : 'all'],
    queryFn: async () => {
      let query = supabase
        .from('practice_groups')
        .select('id, name')
        .eq('active', true)
        .order('name');
      // Fence to the user's scoped groups (super-admins and unscoped users see the RLS org view).
      if (scopedGroupIds) query = query.in('id', scopedGroupIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as OrgOption[];
    },
    staleTime: 1000 * 60 * 10,
  });

  // Initialize selectedOrgIds to all orgs once loaded
  useEffect(() => {
    if (allOrgs.length > 0 && selectedOrgIds.length === 0) {
      setSelectedOrgIds(allOrgs.map(o => o.id));
    }
  }, [allOrgs]);

  // ── Fetch locations for selected orgs ──────────────────────
  const sortedSelectedOrgIdsForLoc = useMemo(() => [...selectedOrgIds].sort().join(','), [selectedOrgIds]);
  const { data: allLocations = [], isLoading: locsLoading } = useQuery({
    queryKey: [
      'export-locations-for-orgs',
      sortedSelectedOrgIdsForLoc,
      scopedLocationIds ? [...scopedLocationIds].sort().join(',') : 'all',
    ],
    queryFn: async () => {
      if (selectedOrgIds.length === 0) return [];
      let query = supabase
        .from('locations')
        .select('id, name, group_id')
        .in('group_id', selectedOrgIds)
        .eq('active', true)
        .order('name');
      // Location-scoped users (coach_scopes of type 'location') only see those locations.
      if (scopedLocationIds) query = query.in('id', scopedLocationIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LocOption[];
    },
    enabled: selectedOrgIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Auto-select all locations when they change
  useEffect(() => {
    setSelectedLocationIds(allLocations.map(l => l.id));
  }, [allLocations]);

  // ── Fetch roles actually present among in-scope participants ──
  // Not the global roles table: only roles held by active participants in the
  // scoped locations. This drops roles with no ProMoves data (e.g. Doctor,
  // non-participant roles) and keeps the picker to what's relevant for this org.
  const scopedLocationIdsForRoles = useMemo(
    () => allLocations.map(l => l.id).sort().join(','),
    [allLocations]
  );
  const { data: allRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['export-roles-in-scope', scopedLocationIdsForRoles],
    queryFn: async () => {
      const locIds = allLocations.map(l => l.id);
      if (locIds.length === 0) return [];
      const { data: staffRows, error } = await supabase
        .from('staff')
        .select('role_id')
        .in('primary_location_id', locIds)
        .eq('is_participant', true)
        .eq('is_paused', false)
        .not('role_id', 'is', null);
      if (error) throw error;
      const roleIds = [...new Set((staffRows || []).map((s: any) => s.role_id as number))];
      if (roleIds.length === 0) return [];
      const { data: rolesData, error: rErr } = await supabase
        .from('roles')
        .select('role_id, role_name')
        .in('role_id', roleIds)
        .order('role_name');
      if (rErr) throw rErr;
      return (rolesData || []) as RoleOption[];
    },
    enabled: allLocations.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Keep role selection in sync with the available roles (mirrors locations):
  // reset to "all" whenever the scoped role set changes, so the "all selected"
  // invariant the estimate/export rely on stays correct.
  useEffect(() => {
    setSelectedRoleIds(allRoles.map(r => r.role_id));
  }, [allRoles]);

  const toggleOrg = (orgId: string) => {
    setSelectedOrgIds(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  const toggleAllOrgs = () => {
    if (selectedOrgIds.length === allOrgs.length) {
      setSelectedOrgIds([]);
    } else {
      setSelectedOrgIds(allOrgs.map(o => o.id));
    }
  };

  const toggleLocation = (locId: string) => {
    setSelectedLocationIds(prev =>
      prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
    );
  };

  const toggleAllLocations = () => {
    if (selectedLocationIds.length === allLocations.length) {
      setSelectedLocationIds([]);
    } else {
      setSelectedLocationIds(allLocations.map(l => l.id));
    }
  };

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const toggleAllRoles = () => {
    if (selectedRoleIds.length === allRoles.length) {
      setSelectedRoleIds([]);
    } else {
      setSelectedRoleIds(allRoles.map(r => r.role_id));
    }
  };

  // ── Row estimate query ───────────────────────────────────────
  const sortedSelectedOrgIds = useMemo(() => [...selectedOrgIds].sort().join(','), [selectedOrgIds]);
  const sortedRoleIds = useMemo(() => [...selectedRoleIds].sort().join(','), [selectedRoleIds]);
  const sortedLocationIds = useMemo(() => [...selectedLocationIds].sort().join(','), [selectedLocationIds]);

  const { data: rowEstimate, isLoading: estimateLoading } = useQuery({
    queryKey: [
      'export-row-estimate',
      config.grain,
      sortedSelectedOrgIds,
      filters.evaluationPeriod.year,
      filters.evaluationPeriod.type === 'Quarterly' ? filters.evaluationPeriod.quarter : 'baseline',
      filters.evaluationPeriod.type,
      sortedRoleIds,
      sortedLocationIds,
    ],
    queryFn: async () => {
      if (selectedOrgIds.length === 0) return 0;

      let totalRows = 0;
      for (const orgId of selectedOrgIds) {
        // Get locations for org (filtered by selectedLocationIds)
        const orgLocationIds = allLocations
          .filter(l => l.group_id === orgId && selectedLocationIds.includes(l.id))
          .map(l => l.id);
        if (orgLocationIds.length === 0) continue;

        // Get staff count
        let staffQuery = supabase.from('staff').select('id', { count: 'exact', head: true })
          .in('primary_location_id', orgLocationIds)
          .eq('is_participant', true)
          .eq('is_paused', false);
        if (selectedRoleIds.length > 0 && selectedRoleIds.length < allRoles.length) {
          staffQuery = staffQuery.in('role_id', selectedRoleIds);
        }
        const { count } = await staffQuery;
        const staffCount = count || 0;

        if (config.grain === 'individual') totalRows += staffCount;
        else if (config.grain === 'location') totalRows += orgLocationIds.length;
        else totalRows += 1; // organization grain
      }
      return totalRows;
    },
    enabled: currentStep === 3 && selectedOrgIds.length > 0,
  });

  // ── Predicted columns ────────────────────────────────────────
  const predictedColumns = useMemo(() => {
    const cols: string[] = [];
    cols.push(COLUMN_NAMES.organization);
    if (config.grain !== 'organization') cols.push(COLUMN_NAMES.location);
    if (config.grain === 'individual') {
      cols.push(COLUMN_NAMES.staffName, COLUMN_NAMES.role);
    } else {
      cols.push(COLUMN_NAMES.staffCount);
    }
    const individual = config.grain === 'individual';
    if (config.includeCompletionRate) {
      cols.push(COLUMN_NAMES.completionRate);
      if (individual) cols.push(COLUMN_NAMES.expected, COLUMN_NAMES.completed, COLUMN_NAMES.missingCount);
    }
    if (config.includeOnTimeRate) {
      cols.push(COLUMN_NAMES.onTimeRate);
      if (individual) cols.push(COLUMN_NAMES.onTimeCount, COLUMN_NAMES.lateCount);
    }
    if (individual && (config.includeCompletionRate || config.includeOnTimeRate)) {
      cols.push(COLUMN_NAMES.lastSubmission);
    }
    if (config.includeDomainAverages) {
      cols.push(`{Domain} ${COLUMN_NAMES.obsMean}`);
      if (config.includeObserverAndSelf) cols.push(`{Domain} ${COLUMN_NAMES.selfMean}`);
    }
    if (config.includeCompetencyAverages && config.grain === 'individual') {
      cols.push(`{Competency} ${COLUMN_NAMES.obsScore}`);
      if (config.includeObserverAndSelf) cols.push(`{Competency} ${COLUMN_NAMES.selfScore}`);
    }
    if (config.includeCompetencyAverages && config.grain !== 'individual') {
      cols.push(COLUMN_NAMES.competencyName, COLUMN_NAMES.domainName, COLUMN_NAMES.obsMean);
      if (config.includeObserverAndSelf) cols.push(COLUMN_NAMES.selfMean);
      cols.push(COLUMN_NAMES.nItems);
    }
    return cols;
  }, [config]);

  // ── Navigation ───────────────────────────────────────────────
  const canNext = useCallback(() => {
    if (currentStep === 0) return true;
    if (currentStep === 1) return selectedOrgIds.length > 0 && selectedLocationIds.length > 0 && !customRangeInvalid;
    if (currentStep === 2) return hasAnyMetric;
    return false;
  }, [currentStep, selectedOrgIds.length, selectedLocationIds.length, hasAnyMetric, customRangeInvalid]);

  // ── Export handler (loops over selected orgs) ────────────────
  const handleExport = async () => {
    if (selectedOrgIds.length === 0 || !user) return;
    setIsExporting(true);

    try {
      // Get role names (shared across orgs)
      const { data: rolesData } = await supabase.from('roles').select('role_id, role_name');
      // Scoped users (single org) get their org's role labels (RDA/DFI/OM);
      // super-admins may export across orgs, so keep platform-generic names.
      const roleMap = new Map((rolesData || []).map(r => [
        r.role_id,
        isSuperAdmin ? (r.role_name || '') : resolveRole(r.role_id, r.role_name || ''),
      ]));

      // Get all org names
      const orgNameMap = new Map(allOrgs.map(o => [o.id, o.name]));

      // Accumulate rows across all selected orgs
      let allPrimaryRows: Record<string, string>[] = [];
      let allCompetencyRows: Record<string, string>[] = [];

      for (const orgId of selectedOrgIds) {
        const orgName = orgNameMap.get(orgId) || '';

        // 1. Resolve scope for this org (use selected locations)
        const orgLocs = allLocations.filter(l => l.group_id === orgId && selectedLocationIds.includes(l.id));
        const scopeLocationIds = orgLocs.map(l => l.id);

        if (scopeLocationIds.length === 0) continue;

        const locationMap = new Map(orgLocs.map(l => [l.id, l.name]));

        // Get staff in scope
        let staffQuery = supabase.from('staff').select('id, name, primary_location_id, role_id')
          .in('primary_location_id', scopeLocationIds)
          .eq('is_participant', true)
          .eq('is_paused', false);
        if (selectedRoleIds.length > 0 && selectedRoleIds.length < allRoles.length) {
          staffQuery = staffQuery.in('role_id', selectedRoleIds);
        }
        const { data: staffData } = await staffQuery;
        const staff = staffData || [];
        if (staff.length === 0) continue;

        // 2. Build submission metrics for this org
        let submissionByStaff = new Map<string, StaffSubmission>();

        if (config.includeCompletionRate || config.includeOnTimeRate) {
          // Resolve the participation window from the chosen period. The start
          // goes to the RPC as p_since; the end is applied client-side (and used
          // as the "as of" date) so weeks after it don't count as missing.
          // End is capped at today so an in-progress quarter isn't penalised.
          let cutoff: string | null = null;
          let endBound: Date | null = null;
          const today = new Date();
          if (config.periodMode === 'custom') {
            cutoff = config.customStart || null;
            endBound = config.customEnd ? new Date(`${config.customEnd}T23:59:59`) : null;
          } else if (filters.evaluationPeriod.type === 'Quarterly' && filters.evaluationPeriod.quarter) {
            const { start, end } = quarterDateBounds(filters.evaluationPeriod.quarter, filters.evaluationPeriod.year);
            cutoff = start;
            endBound = end > today ? today : end;
          }
          const batchSize = 20;
          for (let i = 0; i < staff.length; i += batchSize) {
            const batch = staff.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(async (s) => {
              const params: any = { p_staff_id: s.id };
              if (cutoff) params.p_since = cutoff;
              const { data } = await supabase.rpc('get_staff_submission_windows', params);
              const windows = ((data || []) as any[]).filter(
                (w) => !endBound || new Date(w.week_of) <= endBound
              );
              const stats = calculateSubmissionStats(windows as any, endBound || undefined);
              // Latest actual submission date within the period (conf or perf).
              let lastSubmission: string | null = null;
              for (const w of windows) {
                if (w.status === 'submitted' && w.submitted_at) {
                  const d = String(w.submitted_at).slice(0, 10);
                  if (!lastSubmission || d > lastSubmission) lastSubmission = d;
                }
              }
              return {
                staffId: s.id,
                completionRate: stats.hasData ? stats.completionRate : null,
                onTimeRate: stats.hasData ? stats.onTimeRate : null,
                expected: stats.totalExpected,
                completed: stats.completed,
                onTime: stats.onTime,
                late: stats.late,
                missing: stats.missing,
                lastSubmission,
              };
            }));
            for (const r of results) {
              const { staffId, ...rest } = r;
              submissionByStaff.set(staffId, rest);
            }
          }
        }

        // 3. Build domain metrics for this org
        let domainRows: EvalDistributionRow[] = [];
        if (config.includeDomainAverages) {
          const types = filters.evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
          const quarter = filters.evaluationPeriod.type === 'Quarterly' ? filters.evaluationPeriod.quarter : null;
          const { data } = await supabase.rpc('get_eval_distribution_metrics', {
            p_org_id: orgId,
            p_types: types,
            p_program_year: filters.evaluationPeriod.year,
            p_quarter: quarter || null,
            p_location_ids: scopeLocationIds,
            p_role_ids: selectedRoleIds.length > 0 && selectedRoleIds.length < allRoles.length ? selectedRoleIds : null,
          });
          domainRows = (data || []) as EvalDistributionRow[];
        }

        // 4. Build competency metrics for this org
        let competencyItems: any[] = [];
        if (config.includeCompetencyAverages) {
          let query = supabase
            .from('evaluation_items')
            .select('competency_id, competency_name_snapshot, domain_name, observer_score, self_score, observer_is_na, self_is_na, evaluation_id, evaluations!inner(staff_id, location_id, role_id, type, quarter, program_year, status)')
            .eq('evaluations.status', 'submitted')
            .eq('evaluations.program_year', filters.evaluationPeriod.year)
            .in('evaluations.location_id', scopeLocationIds);

          if (filters.evaluationPeriod.type === 'Baseline') {
            query = query.eq('evaluations.type', 'Baseline');
          } else {
            query = query.eq('evaluations.type', 'Quarterly');
            if (filters.evaluationPeriod.quarter) {
              query = query.eq('evaluations.quarter', filters.evaluationPeriod.quarter);
            }
          }
          if (selectedRoleIds.length > 0 && selectedRoleIds.length < allRoles.length) {
            query = query.in('evaluations.role_id', selectedRoleIds);
          }

          const { data } = await query;
          competencyItems = data || [];
        }

        // 5. Build rows for this org
        if (config.includeCompletionRate || config.includeOnTimeRate || config.includeDomainAverages) {
          const rows = buildPrimaryRows(
            config, staff, orgName, locationMap, roleMap,
            submissionByStaff, domainRows
          );
          allPrimaryRows.push(...rows);
        }

        if (config.includeCompetencyAverages && competencyItems.length > 0) {
          const rows = buildCompetencyRows(
            config, staff, orgName, locationMap, roleMap, competencyItems
          );
          allCompetencyRows.push(...rows);
        }
      }

      // 6. Download assembled files
      const periodLabel = periodDisplay.replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      let downloadedFiles = 0;

      if (allPrimaryRows.length > 0) {
        // Sort across orgs: org name, then location, then staff
        allPrimaryRows.sort((a, b) =>
          (a[COLUMN_NAMES.organization] || '').localeCompare(b[COLUMN_NAMES.organization] || '')
          || (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || '')
          || (a[COLUMN_NAMES.staffName] || '').localeCompare(b[COLUMN_NAMES.staffName] || '')
        );
        downloadCSV(allPrimaryRows, `eval_export_${config.grain}_${periodLabel}_${dateStr}`);
        downloadedFiles++;
      }

      if (allCompetencyRows.length > 0) {
        allCompetencyRows.sort((a, b) =>
          (a[COLUMN_NAMES.organization] || '').localeCompare(b[COLUMN_NAMES.organization] || '')
          || (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || '')
          || (a[COLUMN_NAMES.competencyName] || '').localeCompare(b[COLUMN_NAMES.competencyName] || '')
        );
        downloadCSV(allCompetencyRows, `eval_export_${config.grain}_competencies_${periodLabel}_${dateStr}`);
        downloadedFiles++;
      }

      if (downloadedFiles === 0) {
        toast.info('No data matched current filters');
      } else if (downloadedFiles === 2) {
        toast.success('2 files downloaded: metrics and competencies');
      } else {
        toast.success('Export downloaded');
      }

      // 7. Audit trail
      try {
        const { data: myStaff } = await supabase.from('staff').select('id').eq('user_id', user.id).single();
        if (myStaff) {
          await supabase.from('admin_audit').insert([{
            action: 'reports_export_downloaded',
            changed_by: myStaff.id,
            staff_id: myStaff.id,
            scope_group_id: selectedOrgIds.length === 1 ? selectedOrgIds[0] : null,
            new_values: {
              exportVersion: EXPORT_FORMAT.version,
              grain: config.grain,
              period: filters.evaluationPeriod,
              filtersApplied: { organizationIds: selectedOrgIds, locationIds: selectedLocationIds, roleIds: selectedRoleIds },
              metricFlags: config,
              rowCount: rowEstimate || 0,
              downloadedFiles,
            } as any,
          }]);
        }
      } catch {
        // Audit failure is non-blocking
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <StepBar currentStep={currentStep} steps={STEPS} />

      {/* Step 0: Grain */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What level of detail?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={config.grain}
              onValueChange={(v) => setConfig(prev => ({ ...prev, grain: v as ExportGrain }))}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {GRAIN_OPTIONS.map(opt => (
                <Label
                  key={opt.value}
                  htmlFor={`grain-${opt.value}`}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors
                    ${config.grain === opt.value ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}
                >
                  <RadioGroupItem value={opt.value} id={`grain-${opt.value}`} className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <span className="font-medium">{opt.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{opt.description}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {currentStep === 1 && (
        <div className="space-y-4">
          {/* Period: a quarter, or a custom date range. Governs both
              participation weeks and (quarter mode only) evaluation columns. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Period</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <ToggleGroup
                type="single"
                value={config.periodMode}
                onValueChange={(v) => {
                  if (!v) return;
                  const mode = v as PeriodMode;
                  setConfig(prev => mode === 'custom'
                    // A custom range can't map to quarter-tagged evals, so drop
                    // the eval columns when switching into custom mode.
                    ? { ...prev, periodMode: mode, includeDomainAverages: false, includeCompetencyAverages: false }
                    : { ...prev, periodMode: mode });
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="quarter" size="sm">By quarter</ToggleGroupItem>
                <ToggleGroupItem value="custom" size="sm">Custom range</ToggleGroupItem>
              </ToggleGroup>

              {config.periodMode === 'quarter' ? (
                <EvalPeriodSelector
                  value={filters.evaluationPeriod}
                  onChange={(period) => onFiltersChange({ ...filters, evaluationPeriod: period as any })}
                  className="w-full max-w-xs"
                />
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="customStart" className="text-2xs text-muted-foreground">From</Label>
                    <Input
                      id="customStart"
                      type="date"
                      className="max-w-[10rem]"
                      value={config.customStart ?? ''}
                      max={config.customEnd ?? undefined}
                      onChange={(e) => setConfig(prev => ({ ...prev, customStart: e.target.value || null }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="customEnd" className="text-2xs text-muted-foreground">To (blank = today)</Label>
                    <Input
                      id="customEnd"
                      type="date"
                      className="max-w-[10rem]"
                      value={config.customEnd ?? ''}
                      min={config.customStart ?? undefined}
                      onChange={(e) => setConfig(prev => ({ ...prev, customEnd: e.target.value || null }))}
                    />
                  </div>
                  {customRangeInvalid && (
                    <p className="w-full text-2xs text-destructive">
                      {config.customStart
                        ? 'Start date must be on or before the end date.'
                        : 'Choose a start date for the custom period.'}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Organizations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                   Groups
                  <Badge variant="secondary" className="text-xs ml-1">
                    {selectedOrgIds.length}/{allOrgs.length}
                  </Badge>
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAllOrgs} className="text-xs h-7 px-2">
                  {selectedOrgIds.length === allOrgs.length ? 'None' : 'All'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {orgsLoading ? (
                <div className="space-y-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1.5 pr-3">
                    {allOrgs.map(org => (
                      <div key={org.id} className="flex items-center space-x-2">
                        <Checkbox id={`org-${org.id}`} checked={selectedOrgIds.includes(org.id)} onCheckedChange={() => toggleOrg(org.id)} />
                        <Label htmlFor={`org-${org.id}`} className="cursor-pointer text-sm leading-tight">{org.name}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedOrgIds.length === 0 && !orgsLoading && (
                <p className="text-xs text-destructive mt-2">Select at least one.</p>
              )}
            </CardContent>
          </Card>

          {/* Locations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  Locations
                  <Badge variant="secondary" className="text-xs ml-1">
                    {selectedLocationIds.length}/{allLocations.length}
                  </Badge>
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAllLocations} className="text-xs h-7 px-2">
                  {selectedLocationIds.length === allLocations.length ? 'None' : 'All'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {locsLoading ? (
                <div className="space-y-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
              ) : allLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations for selected groups.</p>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1.5 pr-3">
                    {allLocations.map(loc => (
                      <div key={loc.id} className="flex items-center space-x-2">
                        <Checkbox id={`loc-${loc.id}`} checked={selectedLocationIds.includes(loc.id)} onCheckedChange={() => toggleLocation(loc.id)} />
                        <Label htmlFor={`loc-${loc.id}`} className="cursor-pointer text-sm leading-tight">{loc.name}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedLocationIds.length === 0 && allLocations.length > 0 && (
                <p className="text-xs text-destructive mt-2">Select at least one.</p>
              )}
            </CardContent>
          </Card>

          {/* Roles */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Roles
                  <Badge variant="secondary" className="text-xs ml-1">
                    {selectedRoleIds.length}/{allRoles.length}
                  </Badge>
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAllRoles} className="text-xs h-7 px-2">
                  {selectedRoleIds.length === allRoles.length ? 'None' : 'All'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {rolesLoading ? (
                <div className="space-y-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1.5 pr-3">
                    {allRoles.map(role => (
                      <div key={role.role_id} className="flex items-center space-x-2">
                        <Checkbox id={`role-${role.role_id}`} checked={selectedRoleIds.includes(role.role_id)} onCheckedChange={() => toggleRole(role.role_id)} />
                        <Label htmlFor={`role-${role.role_id}`} className="cursor-pointer text-sm leading-tight">{resolveRole(role.role_id, role.role_name)}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {/* Step 2: Metrics */}
      {currentStep === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ProMove Submission */}
          <Card className={isBaseline ? 'opacity-50' : ''}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                ProMove Submission
                {isBaseline && <Badge variant="outline" className="text-xs">N/A for Baseline</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="completionRate"
                  checked={config.includeCompletionRate}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeCompletionRate: !!v }))}
                  disabled={isBaseline}
                />
                <Label htmlFor="completionRate" className="cursor-pointer">Completion %</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="onTimeRate"
                  checked={config.includeOnTimeRate}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeOnTimeRate: !!v }))}
                  disabled={isBaseline}
                />
                <Label htmlFor="onTimeRate" className="cursor-pointer">On-Time %</Label>
              </div>
              <p className="text-2xs text-muted-foreground">
                Scored over {isCustomPeriod ? 'the custom date range' : 'the selected quarter'} (set on the Scope step).
              </p>
            </CardContent>
          </Card>

          {/* Eval Performance — evaluations are quarter-tagged, so these are
              only available in "by quarter" mode. */}
          <Card className={isCustomPeriod ? 'opacity-50' : ''}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Evaluation Performance
                {isCustomPeriod && <Badge variant="outline" className="text-xs">Requires a quarter</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="domainAvg"
                  checked={config.includeDomainAverages}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeDomainAverages: !!v }))}
                  disabled={isCustomPeriod}
                />
                <Label htmlFor="domainAvg" className="cursor-pointer">Domain averages</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="compAvg"
                  checked={config.includeCompetencyAverages}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeCompetencyAverages: !!v }))}
                  disabled={isCustomPeriod}
                />
                <Label htmlFor="compAvg" className="cursor-pointer">Competency averages</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="obsSelf"
                  checked={config.includeObserverAndSelf}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeObserverAndSelf: !!v }))}
                  disabled={isCustomPeriod}
                />
                <Label htmlFor="obsSelf" className="cursor-pointer">Include observer + self columns</Label>
              </div>
            </CardContent>
          </Card>

          {!hasAnyMetric && (
            <Alert className="md:col-span-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Select at least one metric to continue.</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Step 3: Preview & Download */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Grain</span>
                  <p className="font-medium capitalize">{config.grain}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Groups</span>
                  <p className="font-medium">
                    {selectedOrgIds.length === allOrgs.length
                      ? `All (${allOrgs.length})`
                      : `${selectedOrgIds.length} of ${allOrgs.length}`}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Locations</span>
                  <p className="font-medium">
                    {selectedLocationIds.length === allLocations.length
                      ? `All (${allLocations.length})`
                      : `${selectedLocationIds.length} of ${allLocations.length}`}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Roles</span>
                  <p className="font-medium">
                    {selectedRoleIds.length === allRoles.length
                      ? `All (${allRoles.length})`
                      : `${selectedRoleIds.length} of ${allRoles.length}`}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p className="font-medium">{periodDisplay}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Est. Rows</span>
                  {estimateLoading ? (
                    <Skeleton className="h-5 w-12 mt-0.5" />
                  ) : (
                    <p className="font-medium">
                      {rowEstimate ?? 0}
                      {(rowEstimate ?? 0) > MAX_EXPORT_ROWS && (
                        <span className="text-destructive ml-1">(exceeds limit)</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Files</span>
                <p className="text-sm font-medium">
                  {(config.includeDomainAverages || config.includeCompletionRate || config.includeOnTimeRate) && config.includeCompetencyAverages
                    ? '2 CSVs'
                    : '1 CSV'}
                </p>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Columns</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {predictedColumns.map((col, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-normal">
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {(rowEstimate ?? 0) > MAX_EXPORT_ROWS && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Row count exceeds {MAX_EXPORT_ROWS.toLocaleString()} limit. Please narrow your filters.
              </AlertDescription>
            </Alert>
          )}

          {!estimateLoading && (rowEstimate ?? 0) === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>No rows match current filters.</AlertDescription>
            </Alert>
          )}

          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={
              isExporting
              || estimateLoading
              || selectedOrgIds.length === 0
              || (rowEstimate ?? 0) === 0
              || (rowEstimate ?? 0) > MAX_EXPORT_ROWS
              || customRangeInvalid
            }
            onClick={handleExport}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </>
            )}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(s => s - 1)}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {currentStep < 3 && (
          <Button onClick={() => setCurrentStep(s => s + 1)} disabled={!canNext()}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Row builders ─────────────────────────────────────────────

function fmt(val: number | null, decimals: number): string {
  if (val === null || val === undefined) return EXPORT_FORMAT.nullToken;
  return decimals === 0 ? String(Math.round(val)) : val.toFixed(decimals);
}

function buildPrimaryRows(
  config: ExportConfig,
  staff: { id: string; name: string; primary_location_id: string | null; role_id: number | null }[],
  orgName: string,
  locationMap: Map<string, string>,
  roleMap: Map<number, string>,
  submissionByStaff: Map<string, StaffSubmission>,
  domainRows: EvalDistributionRow[],
): Record<string, string>[] {
  const domainNames = [...new Set(domainRows.map(r => r.domain_name))].sort();

  if (config.grain === 'individual') {
    const domainByStaff = new Map<string, Map<string, { obsSum: number; selfSum: number; obsN: number; selfN: number }>>();
    for (const r of domainRows) {
      if (!domainByStaff.has(r.staff_id)) domainByStaff.set(r.staff_id, new Map());
      const staffDomains = domainByStaff.get(r.staff_id)!;
      if (!staffDomains.has(r.domain_name)) staffDomains.set(r.domain_name, { obsSum: 0, selfSum: 0, obsN: 0, selfN: 0 });
      const d = staffDomains.get(r.domain_name)!;
      if (r.obs_mean !== null) { d.obsSum += r.obs_mean * r.n_items; d.obsN += r.n_items; }
      if (r.self_mean !== null) { d.selfSum += r.self_mean * r.n_items; d.selfN += r.n_items; }
    }

    const rows: Record<string, string>[] = [];
    for (const s of staff) {
      const row: Record<string, string> = {
        [COLUMN_NAMES.organization]: orgName,
        [COLUMN_NAMES.location]: locationMap.get(s.primary_location_id || '') || '',
        [COLUMN_NAMES.staffName]: s.name,
        [COLUMN_NAMES.role]: roleMap.get(s.role_id || 0) || '',
      };

      const sub = submissionByStaff.get(s.id);
      if (config.includeCompletionRate) {
        row[COLUMN_NAMES.completionRate] = fmt(sub?.completionRate ?? null, EXPORT_FORMAT.percentDecimals);
        row[COLUMN_NAMES.expected] = fmt(sub?.expected ?? null, 0);
        row[COLUMN_NAMES.completed] = fmt(sub?.completed ?? null, 0);
        row[COLUMN_NAMES.missingCount] = fmt(sub?.missing ?? null, 0);
      }
      if (config.includeOnTimeRate) {
        row[COLUMN_NAMES.onTimeRate] = fmt(sub?.onTimeRate ?? null, EXPORT_FORMAT.percentDecimals);
        row[COLUMN_NAMES.onTimeCount] = fmt(sub?.onTime ?? null, 0);
        row[COLUMN_NAMES.lateCount] = fmt(sub?.late ?? null, 0);
      }
      if (config.includeCompletionRate || config.includeOnTimeRate) {
        row[COLUMN_NAMES.lastSubmission] = sub?.lastSubmission ?? EXPORT_FORMAT.nullToken;
      }

      if (config.includeDomainAverages) {
        const staffDomains = domainByStaff.get(s.id);
        for (const dn of domainNames) {
          const d = staffDomains?.get(dn);
          row[`${dn} ${COLUMN_NAMES.obsMean}`] = fmt(d && d.obsN > 0 ? d.obsSum / d.obsN : null, EXPORT_FORMAT.meanDecimals);
          if (config.includeObserverAndSelf) {
            row[`${dn} ${COLUMN_NAMES.selfMean}`] = fmt(d && d.selfN > 0 ? d.selfSum / d.selfN : null, EXPORT_FORMAT.meanDecimals);
          }
        }
      }
      rows.push(row);
    }
    return rows;
  }

  if (config.grain === 'location') {
    const locStaffMap = new Map<string, typeof staff>();
    for (const s of staff) {
      const lid = s.primary_location_id || '';
      if (!locStaffMap.has(lid)) locStaffMap.set(lid, []);
      locStaffMap.get(lid)!.push(s);
    }

    const locDomainMap = new Map<string, Map<string, { obsSum: number; selfSum: number; obsN: number; selfN: number }>>();
    for (const r of domainRows) {
      if (!locDomainMap.has(r.location_id)) locDomainMap.set(r.location_id, new Map());
      const dm = locDomainMap.get(r.location_id)!;
      if (!dm.has(r.domain_name)) dm.set(r.domain_name, { obsSum: 0, selfSum: 0, obsN: 0, selfN: 0 });
      const d = dm.get(r.domain_name)!;
      if (r.obs_mean !== null) { d.obsSum += r.obs_mean * r.n_items; d.obsN += r.n_items; }
      if (r.self_mean !== null) { d.selfSum += r.self_mean * r.n_items; d.selfN += r.n_items; }
    }

    const rows: Record<string, string>[] = [];
    for (const [lid, locStaff] of locStaffMap) {
      const row: Record<string, string> = {
        [COLUMN_NAMES.organization]: orgName,
        [COLUMN_NAMES.location]: locationMap.get(lid) || '',
        [COLUMN_NAMES.staffCount]: String(locStaff.length),
      };

      if (config.includeCompletionRate || config.includeOnTimeRate) {
        let totalExp = 0, totalComp = 0, totalOT = 0;
        for (const s of locStaff) {
          const sub = submissionByStaff.get(s.id);
          if (sub?.completionRate !== null && sub?.completionRate !== undefined) {
            totalExp++;
            totalComp += (sub.completionRate || 0) / 100;
            totalOT += (sub.onTimeRate || 0) / 100;
          }
        }
        if (config.includeCompletionRate) {
          row[COLUMN_NAMES.completionRate] = totalExp > 0 ? fmt((totalComp / totalExp) * 100, EXPORT_FORMAT.percentDecimals) : EXPORT_FORMAT.nullToken;
        }
        if (config.includeOnTimeRate) {
          row[COLUMN_NAMES.onTimeRate] = totalExp > 0 ? fmt((totalOT / totalExp) * 100, EXPORT_FORMAT.percentDecimals) : EXPORT_FORMAT.nullToken;
        }
      }

      if (config.includeDomainAverages) {
        const dm = locDomainMap.get(lid);
        for (const dn of domainNames) {
          const d = dm?.get(dn);
          row[`${dn} ${COLUMN_NAMES.obsMean}`] = fmt(d && d.obsN > 0 ? d.obsSum / d.obsN : null, EXPORT_FORMAT.meanDecimals);
          if (config.includeObserverAndSelf) {
            row[`${dn} ${COLUMN_NAMES.selfMean}`] = fmt(d && d.selfN > 0 ? d.selfSum / d.selfN : null, EXPORT_FORMAT.meanDecimals);
          }
        }
      }
      rows.push(row);
    }
    return rows;
  }

  // Organization grain: single row for this org
  const row: Record<string, string> = {
    [COLUMN_NAMES.organization]: orgName,
    [COLUMN_NAMES.staffCount]: String(staff.length),
  };

  if (config.includeCompletionRate || config.includeOnTimeRate) {
    let totalExp = 0, totalComp = 0, totalOT = 0;
    for (const s of staff) {
      const sub = submissionByStaff.get(s.id);
      if (sub?.completionRate !== null && sub?.completionRate !== undefined) {
        totalExp++;
        totalComp += (sub.completionRate || 0) / 100;
        totalOT += (sub.onTimeRate || 0) / 100;
      }
    }
    if (config.includeCompletionRate) {
      row[COLUMN_NAMES.completionRate] = totalExp > 0 ? fmt((totalComp / totalExp) * 100, EXPORT_FORMAT.percentDecimals) : EXPORT_FORMAT.nullToken;
    }
    if (config.includeOnTimeRate) {
      row[COLUMN_NAMES.onTimeRate] = totalExp > 0 ? fmt((totalOT / totalExp) * 100, EXPORT_FORMAT.percentDecimals) : EXPORT_FORMAT.nullToken;
    }
  }

  if (config.includeDomainAverages) {
    const aggDomain = new Map<string, { obsSum: number; selfSum: number; obsN: number; selfN: number }>();
    for (const r of domainRows) {
      if (!aggDomain.has(r.domain_name)) aggDomain.set(r.domain_name, { obsSum: 0, selfSum: 0, obsN: 0, selfN: 0 });
      const d = aggDomain.get(r.domain_name)!;
      if (r.obs_mean !== null) { d.obsSum += r.obs_mean * r.n_items; d.obsN += r.n_items; }
      if (r.self_mean !== null) { d.selfSum += r.self_mean * r.n_items; d.selfN += r.n_items; }
    }
    for (const dn of domainNames) {
      const d = aggDomain.get(dn);
      row[`${dn} ${COLUMN_NAMES.obsMean}`] = fmt(d && d.obsN > 0 ? d.obsSum / d.obsN : null, EXPORT_FORMAT.meanDecimals);
      if (config.includeObserverAndSelf) {
        row[`${dn} ${COLUMN_NAMES.selfMean}`] = fmt(d && d.selfN > 0 ? d.selfSum / d.selfN : null, EXPORT_FORMAT.meanDecimals);
      }
    }
  }

  return [row];
}

function buildCompetencyRows(
  config: ExportConfig,
  staff: { id: string; name: string; primary_location_id: string | null; role_id: number | null }[],
  orgName: string,
  locationMap: Map<string, string>,
  roleMap: Map<number, string>,
  competencyItems: any[],
): Record<string, string>[] {
  if (config.grain === 'individual') {
    const compNames = [...new Set(competencyItems.map(i => i.competency_name_snapshot as string))].sort();

    const staffCompMap = new Map<string, Map<string, { obsSum: number; selfSum: number; obsN: number; selfN: number }>>();
    for (const item of competencyItems) {
      const eval_ = item.evaluations as any;
      const staffId = eval_.staff_id as string;
      if (!staffCompMap.has(staffId)) staffCompMap.set(staffId, new Map());
      const cm = staffCompMap.get(staffId)!;
      const cn = item.competency_name_snapshot as string;
      if (!cm.has(cn)) cm.set(cn, { obsSum: 0, selfSum: 0, obsN: 0, selfN: 0 });
      const d = cm.get(cn)!;
      if (item.observer_score !== null && !item.observer_is_na) { d.obsSum += item.observer_score; d.obsN++; }
      if (item.self_score !== null && !item.self_is_na) { d.selfSum += item.self_score; d.selfN++; }
    }

    const rows: Record<string, string>[] = [];
    for (const s of staff) {
      const cm = staffCompMap.get(s.id);
      if (!cm) continue;
      const row: Record<string, string> = {
        [COLUMN_NAMES.organization]: orgName,
        [COLUMN_NAMES.location]: locationMap.get(s.primary_location_id || '') || '',
        [COLUMN_NAMES.staffName]: s.name,
        [COLUMN_NAMES.role]: roleMap.get(s.role_id || 0) || '',
      };
      for (const cn of compNames) {
        const d = cm.get(cn);
        row[`${cn} ${COLUMN_NAMES.obsScore}`] = fmt(d && d.obsN > 0 ? d.obsSum / d.obsN : null, EXPORT_FORMAT.meanDecimals);
        if (config.includeObserverAndSelf) {
          row[`${cn} ${COLUMN_NAMES.selfScore}`] = fmt(d && d.selfN > 0 ? d.selfSum / d.selfN : null, EXPORT_FORMAT.meanDecimals);
        }
      }
      rows.push(row);
    }
    return rows;
  }

  // Location or org grain: long format
  type GroupKey = string;
  const groupMap = new Map<GroupKey, Map<string, { obsSum: number; selfSum: number; obsN: number; selfN: number; domain: string }>>();

  for (const item of competencyItems) {
    const eval_ = item.evaluations as any;
    const groupKey = config.grain === 'location' ? (eval_.location_id as string) : 'org';
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, new Map());
    const cm = groupMap.get(groupKey)!;
    const cn = item.competency_name_snapshot as string;
    if (!cm.has(cn)) cm.set(cn, { obsSum: 0, selfSum: 0, obsN: 0, selfN: 0, domain: item.domain_name || '' });
    const d = cm.get(cn)!;
    if (item.observer_score !== null && !item.observer_is_na) { d.obsSum += item.observer_score; d.obsN++; }
    if (item.self_score !== null && !item.self_is_na) { d.selfSum += item.self_score; d.selfN++; }
  }

  const rows: Record<string, string>[] = [];
  for (const [gk, cm] of groupMap) {
    for (const [cn, d] of cm) {
      const row: Record<string, string> = {
        [COLUMN_NAMES.organization]: orgName,
      };
      if (config.grain === 'location') {
        row[COLUMN_NAMES.location] = locationMap.get(gk) || '';
      }
      row[COLUMN_NAMES.competencyName] = cn;
      row[COLUMN_NAMES.domainName] = d.domain;
      row[COLUMN_NAMES.obsMean] = fmt(d.obsN > 0 ? d.obsSum / d.obsN : null, EXPORT_FORMAT.meanDecimals);
      if (config.includeObserverAndSelf) {
        row[COLUMN_NAMES.selfMean] = fmt(d.selfN > 0 ? d.selfSum / d.selfN : null, EXPORT_FORMAT.meanDecimals);
      }
      row[COLUMN_NAMES.nItems] = String(d.obsN);
      rows.push(row);
    }
  }

  return rows;
}
