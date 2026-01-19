import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X, Settings2, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { EvalFilters } from '@/types/analytics';

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

const EVALUATION_TYPES = [
  { value: 'Baseline', label: 'Baseline' },
  { value: 'Quarterly', label: 'Quarterly' }
];

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Load organizations on mount
  useEffect(() => {
    loadOrganizations();
    loadRoles();
  }, []);

  // Load locations when organization changes and clear filters
  useEffect(() => {
    if (filters.organizationId) {
      loadLocations();
    } else {
      setLocations([]);
      onFiltersChange({
        ...filters,
        locationIds: [],
        roleIds: []
      });
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

  function clearAllFilters() {
    onFiltersChange({
      ...filters,
      evaluationTypes: [],
      locationIds: [],
      roleIds: [],
      dateRange: {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: new Date()
      },
      includeNoEvals: true,
      windowDays: 42
    });
  }

  // Build active filter chips
  const activeFilters: { label: string; onRemove: () => void }[] = [];
  
  if (filters.evaluationTypes.length > 0) {
    activeFilters.push({
      label: `Types: ${filters.evaluationTypes.join(', ')}`,
      onRemove: () => onFiltersChange({ ...filters, evaluationTypes: [] })
    });
  }
  
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

  return (
    <Card className="p-4 space-y-3">
      {/* Row 1: Primary Filters */}
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

        {/* Locations Multi-select */}
        <MultiSelect
          options={locationOptions}
          selected={filters.locationIds}
          onChange={(selected) => onFiltersChange({ ...filters, locationIds: selected })}
          placeholder="All locations"
          className="w-[180px]"
        />

        {/* Roles Multi-select */}
        <MultiSelect
          options={roleOptions}
          selected={filters.roleIds.map(String)}
          onChange={(selected) => onFiltersChange({ ...filters, roleIds: selected.map(Number) })}
          placeholder="All roles"
          className="w-[160px]"
        />

        {/* Eval Types */}
        <Select
          value={filters.evaluationTypes.length === 1 ? filters.evaluationTypes[0] : 
                 filters.evaluationTypes.length === 0 ? 'all' : 'custom'}
          onValueChange={(value) => {
            if (value === 'all') {
              onFiltersChange({ ...filters, evaluationTypes: [] });
            } else if (value === 'custom') {
              // Keep current selection
            } else {
              onFiltersChange({ ...filters, evaluationTypes: [value] });
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Eval types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {EVALUATION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date Range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(filters.dateRange.start, "MMM d")} – {format(filters.dateRange.end, "MMM d")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Calendar
                  mode="single"
                  selected={filters.dateRange.start}
                  onSelect={(date) => date && onFiltersChange({
                    ...filters,
                    dateRange: { ...filters.dateRange, start: date }
                  })}
                  initialFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Calendar
                  mode="single"
                  selected={filters.dateRange.end}
                  onSelect={(date) => date && onFiltersChange({
                    ...filters,
                    dateRange: { ...filters.dateRange, end: date }
                  })}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

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
                        <p>Used in Pro-Moves Alignment tab: compares staff submissions from this many days before each evaluation to the evaluation results.</p>
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

        {/* Clear All */}
        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-10 text-muted-foreground">
            Clear all
          </Button>
        )}
      </div>

      {/* Row 2: Active Filters as chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active:</span>
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
