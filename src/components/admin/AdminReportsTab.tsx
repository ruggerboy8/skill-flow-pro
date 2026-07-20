import { useState } from 'react';
import { EvaluationsExportTab } from '@/components/admin/eval-results-v2/EvaluationsExportTab';
import type { EvalFilters } from '@/types/analytics';

/**
 * Reports tab on the Admin page. Self-serve CSV export for managers/HR.
 *
 * Primary use: ProMoves participation (completion %, on-time %) for staff
 * conversations and eval prep. Evaluation-performance columns (domain /
 * competency averages) are available as opt-in sections in the same export.
 *
 * This owns its own filter state so the export is fully standalone — it does
 * NOT depend on the Evaluations page. Group/location pickers inside the export
 * are scope-gated to the current user's coach_scopes (super-admins see all).
 */
export function AdminReportsTab() {
  // Default the evaluation period to the current quarter. Participation pulls
  // ignore it (they use the rolling submission window); it only matters when
  // the user opts into evaluation-performance columns.
  const currentYear = new Date().getFullYear();
  const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';

  const [filters, setFilters] = useState<EvalFilters>({
    organizationId: '',
    evaluationPeriod: {
      type: 'Quarterly',
      quarter: currentQuarter,
      year: currentYear,
    },
    locationIds: [],
    roleIds: [],
    includeNoEvals: true,
    windowDays: 42,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Export data</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pull ProMoves participation and evaluation data as a CSV. Choose the level of
          detail, narrow to the people you need, then download.
        </p>
      </div>
      <EvaluationsExportTab filters={filters} onFiltersChange={setFilters} />
    </div>
  );
}
