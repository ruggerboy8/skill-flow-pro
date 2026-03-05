import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StepBar } from '@/components/admin/StepBar';
import { FilterBar } from '@/components/admin/eval-results/FilterBar';
import { downloadCSV } from '@/lib/csvExport';
import { calculateSubmissionStats, calculateCutoffDate } from '@/lib/submissionRateCalc';
import { getPeriodLabel } from '@/types/analytics';
import { toast } from 'sonner';
import {
  Download, ChevronLeft, ChevronRight, AlertTriangle, FileSpreadsheet,
  Users, Building2, MapPin, Loader2,
} from 'lucide-react';
import type { EvalFilters } from '@/types/analytics';
import type { EvalDistributionRow } from '@/types/evalMetricsV2';
import {
  type ExportConfig, type ExportGrain, type TimeWindow,
  DEFAULT_EXPORT_CONFIG, EXPORT_FORMAT, MAX_EXPORT_ROWS, COLUMN_NAMES,
} from '@/types/exportConfig';

// ── Props ──────────────────────────────────────────────────────
interface EvaluationsExportTabProps {
  filters: EvalFilters;
  onFiltersChange: (f: EvalFilters) => void;
}

const STEPS = ['Report Type', 'Scope', 'Metrics', 'Download'];

const GRAIN_OPTIONS: { value: ExportGrain; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'individual', label: 'Individual', description: 'One row per staff member', icon: <Users className="h-5 w-5" /> },
  { value: 'location', label: 'Location', description: 'One row per location (aggregated)', icon: <MapPin className="h-5 w-5" /> },
  { value: 'organization', label: 'Organization', description: 'One row per organization (aggregated)', icon: <Building2 className="h-5 w-5" /> },
];

// ── Component ──────────────────────────────────────────────────
export function EvaluationsExportTab({ filters, onFiltersChange }: EvaluationsExportTabProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [isExporting, setIsExporting] = useState(false);

  const isBaseline = filters.evaluationPeriod.type === 'Baseline';
  const hasAnyMetric = config.includeCompletionRate || config.includeOnTimeRate
    || config.includeDomainAverages || config.includeCompetencyAverages;

  // ── Row estimate query ───────────────────────────────────────
  const sortedLocationIds = useMemo(() => [...filters.locationIds].sort().join(','), [filters.locationIds]);
  const sortedRoleIds = useMemo(() => [...filters.roleIds].sort().join(','), [filters.roleIds]);

  const { data: rowEstimate, isLoading: estimateLoading } = useQuery({
    queryKey: [
      'export-row-estimate',
      config.grain,
      filters.organizationId,
      filters.evaluationPeriod.year,
      filters.evaluationPeriod.type === 'Quarterly' ? filters.evaluationPeriod.quarter : 'baseline',
      filters.evaluationPeriod.type,
      sortedLocationIds,
      sortedRoleIds,
    ],
    queryFn: async () => {
      if (!filters.organizationId) return 0;

      // Get locations for org
      const locQuery = supabase.from('locations').select('id').eq('organization_id', filters.organizationId).eq('active', true);
      const { data: locData } = await locQuery;
      const orgLocationIds = (locData || []).map(l => l.id);
      const scopeLocationIds = filters.locationIds.length > 0
        ? orgLocationIds.filter(id => filters.locationIds.includes(id))
        : orgLocationIds;

      if (scopeLocationIds.length === 0) return 0;

      // Get staff count
      let staffQuery = supabase.from('staff').select('id', { count: 'exact', head: true })
        .in('primary_location_id', scopeLocationIds)
        .eq('is_participant', true)
        .eq('is_paused', false);
      if (filters.roleIds.length > 0) {
        staffQuery = staffQuery.in('role_id', filters.roleIds);
      }
      const { count } = await staffQuery;
      const staffCount = count || 0;

      if (config.grain === 'individual') return staffCount;
      if (config.grain === 'location') return scopeLocationIds.length;
      return 1; // organization grain
    },
    enabled: currentStep === 3 && !!filters.organizationId,
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
    if (config.includeCompletionRate) cols.push(COLUMN_NAMES.completionRate);
    if (config.includeOnTimeRate) cols.push(COLUMN_NAMES.onTimeRate);
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
    if (currentStep === 1) return !!filters.organizationId;
    if (currentStep === 2) return hasAnyMetric;
    return false;
  }, [currentStep, filters.organizationId, hasAnyMetric]);

  // ── Export handler ───────────────────────────────────────────
  const handleExport = async () => {
    if (!filters.organizationId || !user) return;
    setIsExporting(true);

    try {
      // 1. Resolve scope
      const { data: locData } = await supabase.from('locations').select('id, name, organization_id')
        .eq('organization_id', filters.organizationId).eq('active', true);
      const allLocations = locData || [];
      const scopeLocations = filters.locationIds.length > 0
        ? allLocations.filter(l => filters.locationIds.includes(l.id))
        : allLocations;
      const scopeLocationIds = scopeLocations.map(l => l.id);

      if (scopeLocationIds.length === 0) {
        toast.error('No locations match current filters');
        setIsExporting(false);
        return;
      }

      // Get org name
      const { data: orgData } = await supabase.from('organizations').select('name').eq('id', filters.organizationId).single();
      const orgName = orgData?.name || '';

      // Get staff in scope
      let staffQuery = supabase.from('staff').select('id, name, primary_location_id, role_id')
        .in('primary_location_id', scopeLocationIds)
        .eq('is_participant', true)
        .eq('is_paused', false);
      if (filters.roleIds.length > 0) {
        staffQuery = staffQuery.in('role_id', filters.roleIds);
      }
      const { data: staffData } = await staffQuery;
      const staff = staffData || [];

      if (staff.length === 0) {
        toast.error('No staff match current filters');
        setIsExporting(false);
        return;
      }

      // Get role names
      const { data: rolesData } = await supabase.from('roles').select('role_id, role_name');
      const roleMap = new Map((rolesData || []).map(r => [r.role_id, r.role_name || '']));

      // Location name map
      const locationMap = new Map(allLocations.map(l => [l.id, l.name]));

      // 2. Build submission metrics
      let submissionByStaff = new Map<string, { completionRate: number | null; onTimeRate: number | null }>();

      if (config.includeCompletionRate || config.includeOnTimeRate) {
        const cutoff = calculateCutoffDate(config.submissionWindow);
        const batchSize = 20;
        for (let i = 0; i < staff.length; i += batchSize) {
          const batch = staff.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(async (s) => {
            const params: any = { p_staff_id: s.id };
            if (cutoff) params.p_since = cutoff;
            const { data } = await supabase.rpc('get_staff_submission_windows', params);
            const stats = calculateSubmissionStats((data || []) as any);
            return {
              staffId: s.id,
              completionRate: stats.hasData ? stats.completionRate : null,
              onTimeRate: stats.hasData ? stats.onTimeRate : null,
            };
          }));
          for (const r of results) {
            submissionByStaff.set(r.staffId, { completionRate: r.completionRate, onTimeRate: r.onTimeRate });
          }
        }
      }

      // 3. Build domain metrics
      let domainRows: EvalDistributionRow[] = [];
      if (config.includeDomainAverages) {
        const types = filters.evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
        const quarter = filters.evaluationPeriod.type === 'Quarterly' ? filters.evaluationPeriod.quarter : null;
        const { data } = await supabase.rpc('get_eval_distribution_metrics', {
          p_org_id: filters.organizationId,
          p_types: types,
          p_program_year: filters.evaluationPeriod.year,
          p_quarter: quarter || null,
          p_location_ids: filters.locationIds.length > 0 ? filters.locationIds : null,
          p_role_ids: filters.roleIds.length > 0 ? filters.roleIds : null,
        });
        domainRows = (data || []) as EvalDistributionRow[];
      }

      // 4. Build competency metrics
      let competencyItems: any[] = [];
      if (config.includeCompetencyAverages) {
        let query = supabase
          .from('evaluation_items')
          .select('competency_id, competency_name_snapshot, domain_name, observer_score, self_score, observer_is_na, self_is_na, evaluation_id, evaluations!inner(staff_id, location_id, role_id, type, quarter, program_year, status)')
          .eq('evaluations.status', 'submitted')
          .eq('evaluations.program_year', filters.evaluationPeriod.year);

        if (filters.evaluationPeriod.type === 'Baseline') {
          query = query.eq('evaluations.type', 'Baseline');
        } else {
          query = query.eq('evaluations.type', 'Quarterly');
          if (filters.evaluationPeriod.quarter) {
            query = query.eq('evaluations.quarter', filters.evaluationPeriod.quarter);
          }
        }

        if (filters.locationIds.length > 0) {
          query = query.in('evaluations.location_id', filters.locationIds);
        } else {
          query = query.in('evaluations.location_id', scopeLocationIds);
        }
        if (filters.roleIds.length > 0) {
          query = query.in('evaluations.role_id', filters.roleIds);
        }

        const { data } = await query;
        competencyItems = data || [];
      }

      // 5. Assemble CSV rows
      const periodLabel = getPeriodLabel(filters.evaluationPeriod).replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      let downloadedFiles = 0;

      // ── Primary file (submission + domain metrics) ──
      if (config.includeCompletionRate || config.includeOnTimeRate || config.includeDomainAverages) {
        const rows = buildPrimaryRows(
          config, staff, orgName, locationMap, roleMap,
          submissionByStaff, domainRows
        );
        if (rows.length > 0) {
          downloadCSV(rows, `eval_export_${config.grain}_${periodLabel}_${dateStr}`);
          downloadedFiles++;
        }
      }

      // ── Competency file (separate) ──
      if (config.includeCompetencyAverages && competencyItems.length > 0) {
        const rows = buildCompetencyRows(
          config, staff, orgName, locationMap, roleMap, competencyItems
        );
        if (rows.length > 0) {
          downloadCSV(rows, `eval_export_${config.grain}_competencies_${periodLabel}_${dateStr}`);
          downloadedFiles++;
        }
      }

      if (downloadedFiles === 0) {
        toast.info('No data matched current filters');
      } else if (downloadedFiles === 2) {
        toast.success('2 files downloaded: metrics and competencies');
      } else {
        toast.success('Export downloaded');
      }

      // 6. Audit trail
      try {
        const { data: myStaff } = await supabase.from('staff').select('id').eq('user_id', user.id).single();
        if (myStaff) {
          await supabase.from('admin_audit').insert([{
            action: 'evaluations_export_downloaded',
            changed_by: myStaff.id,
            staff_id: myStaff.id,
            scope_organization_id: filters.organizationId || null,
            new_values: {
              exportVersion: EXPORT_FORMAT.version,
              grain: config.grain,
              period: filters.evaluationPeriod,
              filtersApplied: { locationIds: filters.locationIds, roleIds: filters.roleIds },
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

      {/* Step 1: Scope */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select scope</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterBar filters={filters} onFiltersChange={onFiltersChange} />
              {!filters.organizationId && (
                <p className="text-sm text-muted-foreground mt-3">
                  Please select an organization to continue.
                </p>
              )}
            </CardContent>
          </Card>
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
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time window</Label>
                <ToggleGroup
                  type="single"
                  value={config.submissionWindow}
                  onValueChange={(v) => { if (v) setConfig(prev => ({ ...prev, submissionWindow: v as TimeWindow })); }}
                  disabled={isBaseline}
                  className="justify-start"
                >
                  <ToggleGroupItem value="3weeks" size="sm">3 wk</ToggleGroupItem>
                  <ToggleGroupItem value="6weeks" size="sm">6 wk</ToggleGroupItem>
                  <ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </CardContent>
          </Card>

          {/* Eval Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Evaluation Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="domainAvg"
                  checked={config.includeDomainAverages}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeDomainAverages: !!v }))}
                />
                <Label htmlFor="domainAvg" className="cursor-pointer">Domain averages</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="compAvg"
                  checked={config.includeCompetencyAverages}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeCompetencyAverages: !!v }))}
                />
                <Label htmlFor="compAvg" className="cursor-pointer">Competency averages</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="obsSelf"
                  checked={config.includeObserverAndSelf}
                  onCheckedChange={(v) => setConfig(prev => ({ ...prev, includeObserverAndSelf: !!v }))}
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
          {/* Config summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Grain</span>
                  <p className="font-medium capitalize">{config.grain}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p className="font-medium">{getPeriodLabel(filters.evaluationPeriod)}</p>
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
                <div>
                  <span className="text-muted-foreground">Files</span>
                  <p className="font-medium">
                    {(config.includeDomainAverages || config.includeCompletionRate || config.includeOnTimeRate) && config.includeCompetencyAverages
                      ? '2 CSVs'
                      : '1 CSV'}
                  </p>
                </div>
              </div>

              {/* Column preview */}
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

          {/* Warnings */}
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

          {/* Download button */}
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={
              isExporting
              || estimateLoading
              || !filters.organizationId
              || (rowEstimate ?? 0) === 0
              || (rowEstimate ?? 0) > MAX_EXPORT_ROWS
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
  submissionByStaff: Map<string, { completionRate: number | null; onTimeRate: number | null }>,
  domainRows: EvalDistributionRow[],
): Record<string, string>[] {
  // Discover unique domain names in canonical order
  const domainNames = [...new Set(domainRows.map(r => r.domain_name))].sort();

  if (config.grain === 'individual') {
    // Build domain lookup: staffId -> domainName -> { obsMean, selfMean }
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

      if (config.includeCompletionRate) {
        const sub = submissionByStaff.get(s.id);
        row[COLUMN_NAMES.completionRate] = fmt(sub?.completionRate ?? null, EXPORT_FORMAT.percentDecimals);
      }
      if (config.includeOnTimeRate) {
        const sub = submissionByStaff.get(s.id);
        row[COLUMN_NAMES.onTimeRate] = fmt(sub?.onTimeRate ?? null, EXPORT_FORMAT.percentDecimals);
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

    // Sort: org, location, staff name
    rows.sort((a, b) =>
      (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || '')
      || (a[COLUMN_NAMES.staffName] || '').localeCompare(b[COLUMN_NAMES.staffName] || '')
    );
    return rows;
  }

  // Location or org grain
  if (config.grain === 'location') {
    // Group staff by location
    const locStaffMap = new Map<string, typeof staff>();
    for (const s of staff) {
      const lid = s.primary_location_id || '';
      if (!locStaffMap.has(lid)) locStaffMap.set(lid, []);
      locStaffMap.get(lid)!.push(s);
    }

    // Group domain rows by location + domain
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
            // Approximate: we stored rates, not raw counts. For true aggregation we'd need raw counts.
            // This is an acceptable approximation for location-level exports.
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
    rows.sort((a, b) => (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || ''));
    return rows;
  }

  // Organization grain: single row
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
  const staffMap = new Map(staff.map(s => [s.id, s]));

  if (config.grain === 'individual') {
    // Wide format: one row per staff, columns per competency
    // First discover unique competency names
    const compNames = [...new Set(competencyItems.map(i => i.competency_name_snapshot as string))].sort();

    // Group by staff + competency
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
      if (!cm) continue; // Skip staff with no eval data
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
    rows.sort((a, b) =>
      (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || '')
      || (a[COLUMN_NAMES.staffName] || '').localeCompare(b[COLUMN_NAMES.staffName] || '')
    );
    return rows;
  }

  // Location or org grain: long format
  type GroupKey = string; // locationId or 'org'
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

  rows.sort((a, b) => {
    if (config.grain === 'location') {
      const locCmp = (a[COLUMN_NAMES.location] || '').localeCompare(b[COLUMN_NAMES.location] || '');
      if (locCmp !== 0) return locCmp;
    }
    return (a[COLUMN_NAMES.competencyName] || '').localeCompare(b[COLUMN_NAMES.competencyName] || '');
  });

  return rows;
}
