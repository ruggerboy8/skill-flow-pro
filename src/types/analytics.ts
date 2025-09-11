export interface EvalFilters {
  organizationId: string;
  evaluationTypes: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  locationIds: string[];
  roleIds: number[];
  includeNoEvals: boolean;
  windowDays: number;
}