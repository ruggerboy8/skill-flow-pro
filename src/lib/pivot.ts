import { DOMAIN_ORDER } from './domainUtils';

export interface LongRow {
  staff_id: string;
  staff_name: string;
  location_name: string;
  domain_name: string;
  observer_avg: number | null;
  self_avg: number | null;
  has_eval: boolean;
}

export interface PivotedStaffRow {
  staff_id: string;
  staff_name: string;
  location_name: string;
  has_eval: boolean;
  domains: Record<string, {
    obs: number | null;
    self: number | null;
  }>;
}

export interface PivotResult {
  rows: PivotedStaffRow[];
  domains: string[];
}

export function pivotStaffDomain(rows: LongRow[]): PivotResult {
  const byStaff = new Map<string, PivotedStaffRow>();
  const domainsSet = new Set<string>();

  for (const r of rows) {
    if (r.domain_name) {
      domainsSet.add(r.domain_name);
    }
    
    if (!byStaff.has(r.staff_id)) {
      byStaff.set(r.staff_id, {
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        location_name: r.location_name,
        has_eval: false,
        domains: {}
      });
    }
    
    const row = byStaff.get(r.staff_id)!;
    if (r.domain_name) {
      row.domains[r.domain_name] = {
        obs: r.observer_avg,
        self: r.self_avg
      };
    }
    if (r.has_eval) {
      row.has_eval = true;
    }
  }

  // Sort domains by predefined order, then alphabetically
  const domains = Array.from(domainsSet).sort((a, b) => {
    const aIndex = DOMAIN_ORDER.indexOf(a);
    const bIndex = DOMAIN_ORDER.indexOf(b);
    
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  return { 
    rows: Array.from(byStaff.values()).sort((a, b) => {
      // Sort by location, then by staff name
      const aLoc = a.location_name || '';
      const bLoc = b.location_name || '';
      const locationCompare = aLoc.localeCompare(bLoc);
      if (locationCompare !== 0) return locationCompare;
      const aName = a.staff_name || '';
      const bName = b.staff_name || '';
      return aName.localeCompare(bName);
    }),
    domains 
  };
}