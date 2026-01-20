import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { EvalFilters, Quarter, EvaluationPeriod } from '@/types/analytics';
import { getPeriodLabel, comparePeriods, periodsEqual } from '@/types/analytics';

interface FilterBarProps {
  filters: EvalFilters;
  onFiltersChange: (filters: EvalFilters) => void;
}

interface Organization {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface Role {
  role_id: number;
  role_name: string;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  // Fetch available periods for the selected organization
  // Include both submitted AND draft evaluations for period detection
  const { data: availablePeriods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ['org-eval-periods', filters.organizationId],
    queryFn: async () => {
      if (!filters.organizationId) return [];
      
      // Get locations for this org first
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', filters.organizationId)
        .eq('active', true);
      
      if (locError) throw locError;
      const locationIds = (locations || []).map(l => l.id);
      if (locationIds.length === 0) return [];
      
      // Query evaluations using location_id (stored on evaluation) for reliable scoping
      // Include both submitted AND draft for period detection
      const { data, error } = await supabase
        .from('evaluations')
        .select('type, program_year, quarter')
        .in('location_id', locationIds)
        .in('status', ['submitted', 'draft']);
      
      if (error) throw error;
      
      // Extract unique periods using program_year and quarter fields (not created_at)
      const periodSet = new Map<string, EvaluationPeriod>();
      
      (data || []).forEach((e: any) => {
        const year = e.program_year as number;
        const type = e.type as 'Baseline' | 'Quarterly';
        
        if (type === 'Baseline') {
          const key = `Baseline-${year}`;
          if (!periodSet.has(key)) {
            periodSet.set(key, { type: 'Baseline', year });
          }
        } else if (e.quarter) {
          // Use the quarter field directly from the evaluation
          const quarter = e.quarter as Quarter;
          const key = `${quarter}-${year}`;
          if (!periodSet.has(key)) {
            periodSet.set(key, { type: 'Quarterly', quarter, year });
          }
        }
      });
      
      // Sort periods newest first
      return Array.from(periodSet.values()).sort(comparePeriods);
    },
    enabled: !!filters.organizationId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Find current period index in available periods
  const currentPeriodIndex = useMemo(() => {
    return availablePeriods.findIndex(p => periodsEqual(p, filters.evaluationPeriod));
  }, [availablePeriods, filters.evaluationPeriod]);

  // Auto-select most recent period when org changes and periods load
  useEffect(() => {
    if (availablePeriods.length > 0 && filters.organizationId) {
      // Check if current filter matches any available period
      const matchExists = availablePeriods.some(p => periodsEqual(p, filters.evaluationPeriod));
      
      if (!matchExists) {
        // Auto-select the most recent period (first in the sorted array)
        onFiltersChange({
          ...filters,
          evaluationPeriod: availablePeriods[0]
        });
      }
    }
  }, [availablePeriods, filters.organizationId]);

  // Load organizations on mount
  useEffect(() => {
    loadOrganizations();
    loadRoles();
  }, []);

  // Load locations when organization changes
  useEffect(() => {
    if (filters.organizationId) {
      loadLocations();
    } else {
      setLocations([]);
    }
  }, [filters.organizationId]);

  async function loadOrganizations() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
    }
  }

  async function loadLocations() {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', filters.organizationId)
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  }

  async function loadRoles() {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('role_id, role_name')
        .order('role_name');

      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  }

  function navigatePeriod(direction: 'prev' | 'next') {
    if (availablePeriods.length === 0) return;
    
    const newIndex = direction === 'prev' 
      ? currentPeriodIndex + 1  // prev = older = higher index
      : currentPeriodIndex - 1; // next = newer = lower index
    
    if (newIndex >= 0 && newIndex < availablePeriods.length) {
      onFiltersChange({
        ...filters,
        evaluationPeriod: availablePeriods[newIndex]
      });
    }
  }

  function selectPeriod(period: EvaluationPeriod) {
    onFiltersChange({
      ...filters,
      evaluationPeriod: period
    });
    setPeriodPickerOpen(false);
  }

  function clearSecondaryFilters() {
    onFiltersChange({
      ...filters,
      locationIds: [],
      roleIds: [],
    });
  }

  // Navigation state
  const canGoNewer = currentPeriodIndex > 0;
  const canGoOlder = currentPeriodIndex < availablePeriods.length - 1 && currentPeriodIndex !== -1;
  const hasData = availablePeriods.length > 0;

  // Build active filter chips for secondary filters only
  const activeFilters: { label: string; onRemove: () => void }[] = [];
  
  if (filters.locationIds.length > 0) {
    const locationNames = filters.locationIds
      .map(id => locations.find(l => l.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    activeFilters.push({
      label: `Locations: ${locationNames || filters.locationIds.length}`,
      onRemove: () => onFiltersChange({ ...filters, locationIds: [] })
    });
  }
  
  if (filters.roleIds.length > 0) {
    const roleNames = filters.roleIds
      .map(id => roles.find(r => r.role_id === id)?.role_name)
      .filter(Boolean)
      .join(', ');
    activeFilters.push({
      label: `Roles: ${roleNames || filters.roleIds.length}`,
      onRemove: () => onFiltersChange({ ...filters, roleIds: [] })
    });
  }

  const locationOptions = locations.map(l => ({ value: l.id, label: l.name }));
  const roleOptions = roles.map(r => ({ value: r.role_id.toString(), label: r.role_name }));

  const hasSecondaryFilters = filters.locationIds.length > 0 || filters.roleIds.length > 0;

  return (
    <Card className="p-4 space-y-3">
      {/* Row 1: Organization + Timeline Navigation */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Organization */}
        <Select
          value={filters.organizationId}
          onValueChange={(value) => onFiltersChange({ ...filters, organizationId: value })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select organization..." />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Timeline Navigation */}
        {filters.organizationId && (
          <div className="flex items-center gap-1">
            {/* Previous (Older) Button */}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={!canGoOlder || periodsLoading}
              onClick={() => navigatePeriod('prev')}
              title="Previous period (older)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Period Selector */}
            <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "min-w-[140px] justify-center gap-2 font-medium",
                    !hasData && "text-muted-foreground"
                  )}
                  disabled={periodsLoading}
                >
                  <Calendar className="h-4 w-4" />
                  {periodsLoading ? (
                    "Loading..."
                  ) : hasData ? (
                    <>
                      {getPeriodLabel(filters.evaluationPeriod)}
                      {availablePeriods.length > 1 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({currentPeriodIndex + 1}/{availablePeriods.length})
                        </span>
                      )}
                    </>
                  ) : (
                    "No evaluations"
                  )}
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="center">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Available evaluation periods
                  </p>
                  {availablePeriods.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-2 py-2">
                      No evaluations found for this organization
                    </p>
                  ) : (
                    availablePeriods.map((period, idx) => (
                      <Button
                        key={`${period.type}-${period.quarter || ''}-${period.year}`}
                        variant={periodsEqual(period, filters.evaluationPeriod) ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => selectPeriod(period)}
                      >
                        {getPeriodLabel(period)}
                        {idx === 0 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Latest
                          </Badge>
                        )}
                      </Button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Next (Newer) Button */}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={!canGoNewer || periodsLoading}
              onClick={() => navigatePeriod('next')}
              title="Next period (newer)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* More Filters Toggle */}
        <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-10 gap-1",
                hasSecondaryFilters && "text-primary"
              )}
            >
              More filters
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                moreFiltersOpen && "rotate-180"
              )} />
              {hasSecondaryFilters && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Row 2: Collapsible secondary filters */}
      <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
        <CollapsibleContent className="pt-2">
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg">
            {/* Locations Multi-select */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Locations</Label>
              <MultiSelect
                options={locationOptions}
                selected={filters.locationIds}
                onChange={(selected) => onFiltersChange({ ...filters, locationIds: selected })}
                placeholder="All locations"
                className="w-[200px]"
              />
            </div>

            {/* Roles Multi-select */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Roles</Label>
              <MultiSelect
                options={roleOptions}
                selected={filters.roleIds.map(String)}
                onChange={(selected) => onFiltersChange({ ...filters, roleIds: selected.map(Number) })}
                placeholder="All roles"
                className="w-[180px]"
              />
            </div>

            {/* Clear secondary filters */}
            {hasSecondaryFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearSecondaryFilters}
                className="text-muted-foreground self-end"
              >
                Clear filters
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Row 3: Active Filters as chips (only when collapsed) */}
      {!moreFiltersOpen && activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          {activeFilters.map((filter, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {filter.label}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={filter.onRemove}
              />
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
