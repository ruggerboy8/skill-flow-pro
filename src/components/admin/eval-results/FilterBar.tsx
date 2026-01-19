import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, X, Settings2, HelpCircle } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { EvalFilters, Quarter, EvaluationPeriodType } from '@/types/analytics';

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

const PERIODS: { value: EvaluationPeriodType | Quarter; label: string; type: EvaluationPeriodType; quarter?: Quarter }[] = [
  { value: 'Baseline', label: 'Baseline', type: 'Baseline' },
  { value: 'Q1', label: 'Q1', type: 'Quarterly', quarter: 'Q1' },
  { value: 'Q2', label: 'Q2', type: 'Quarterly', quarter: 'Q2' },
  { value: 'Q3', label: 'Q3', type: 'Quarterly', quarter: 'Q3' },
  { value: 'Q4', label: 'Q4', type: 'Quarterly', quarter: 'Q4' },
];

// Generate year options (current year and 2 years back)
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

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

  function handlePeriodSelect(period: typeof PERIODS[number]) {
    onFiltersChange({
      ...filters,
      evaluationPeriod: {
        type: period.type,
        quarter: period.quarter,
        year: filters.evaluationPeriod.year
      }
    });
  }

  function handleYearChange(year: string) {
    onFiltersChange({
      ...filters,
      evaluationPeriod: {
        ...filters.evaluationPeriod,
        year: parseInt(year)
      }
    });
  }

  function clearSecondaryFilters() {
    onFiltersChange({
      ...filters,
      locationIds: [],
      roleIds: [],
      includeNoEvals: true,
      windowDays: 42
    });
  }

  // Get current period value for highlighting
  const currentPeriodValue = filters.evaluationPeriod.type === 'Baseline' 
    ? 'Baseline' 
    : filters.evaluationPeriod.quarter;

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
  const yearOptions = getYearOptions();

  const hasSecondaryFilters = filters.locationIds.length > 0 || filters.roleIds.length > 0;

  return (
    <Card className="p-4 space-y-3">
      {/* Row 1: Organization + Period Pills + Year */}
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

        {/* Period Pills */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {PERIODS.map((period) => (
            <Button
              key={period.value}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-md text-sm font-medium transition-colors",
                currentPeriodValue === period.value
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              onClick={() => handlePeriodSelect(period)}
            >
              {period.label}
            </Button>
          ))}
        </div>

        {/* Year Selector */}
        <Select
          value={filters.evaluationPeriod.year.toString()}
          onValueChange={handleYearChange}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {/* Options Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-10">
              <Settings2 className="h-4 w-4 mr-1" />
              Options
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-no-evals"
                  checked={filters.includeNoEvals}
                  onCheckedChange={(checked) => onFiltersChange({
                    ...filters,
                    includeNoEvals: !!checked
                  })}
                />
                <Label htmlFor="include-no-evals" className="text-sm">
                  Include staff with no evaluations
                </Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="window-days" className="text-sm">Window (days)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Used for Pro-Moves comparison: analyzes staff submissions from this many days before each evaluation.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="window-days"
                  type="number"
                  min="1"
                  max="365"
                  className="w-20"
                  value={filters.windowDays}
                  onChange={(e) => onFiltersChange({
                    ...filters,
                    windowDays: parseInt(e.target.value) || 42
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Default: 42 days (6 weeks)
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
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
