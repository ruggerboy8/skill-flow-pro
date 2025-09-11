import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
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
  'baseline',
  'midpoint', 
  'Q1',
  'Q2',
  'Q3',
  'Q4'
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

  function toggleEvaluationType(type: string) {
    const newTypes = filters.evaluationTypes.includes(type)
      ? filters.evaluationTypes.filter(t => t !== type)
      : [...filters.evaluationTypes, type];
    
    onFiltersChange({
      ...filters,
      evaluationTypes: newTypes
    });
  }

  function toggleLocation(locationId: string) {
    const newLocationIds = filters.locationIds.includes(locationId)
      ? filters.locationIds.filter(id => id !== locationId)
      : [...filters.locationIds, locationId];
    
    onFiltersChange({
      ...filters,
      locationIds: newLocationIds
    });
  }

  function toggleRole(roleId: number) {
    const newRoleIds = filters.roleIds.includes(roleId)
      ? filters.roleIds.filter(id => id !== roleId)
      : [...filters.roleIds, roleId];
    
    onFiltersChange({
      ...filters,
      roleIds: newRoleIds
    });
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {/* Organization - Required */}
        <div className="grid gap-2">
          <Label>Organization *</Label>
          <Select
            value={filters.organizationId}
            onValueChange={(value) => onFiltersChange({ ...filters, organizationId: value })}
          >
            <SelectTrigger>
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Evaluation Types */}
          <div className="space-y-2">
            <Label>Evaluation Types</Label>
            <div className="flex flex-wrap gap-2">
              {EVALUATION_TYPES.map((type) => (
                <Badge
                  key={type}
                  variant={filters.evaluationTypes.includes(type) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleEvaluationType(type)}
                >
                  {type}
                  {filters.evaluationTypes.includes(type) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(filters.dateRange.start, "MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.start}
                    onSelect={(date) => date && onFiltersChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, start: date }
                    })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="self-center text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(filters.dateRange.end, "MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.end}
                    onSelect={(date) => date && onFiltersChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, end: date }
                    })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Locations */}
          <div className="space-y-2">
            <Label>Locations</Label>
            <div className="flex flex-wrap gap-2">
              {locations.length === 0 && !filters.organizationId && (
                <span className="text-sm text-muted-foreground">Select organization first</span>
              )}
              {locations.map((location) => (
                <Badge
                  key={location.id}
                  variant={filters.locationIds.includes(location.id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleLocation(location.id)}
                >
                  {location.name}
                  {filters.locationIds.includes(location.id) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </Badge>
              ))}
              {locations.length > 0 && filters.locationIds.length === 0 && (
                <span className="text-sm text-muted-foreground">All locations</span>
              )}
            </div>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <Badge
                  key={role.role_id}
                  variant={filters.roleIds.includes(role.role_id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleRole(role.role_id)}
                >
                  {role.role_name}
                  {filters.roleIds.includes(role.role_id) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </Badge>
              ))}
              {filters.roleIds.length === 0 && (
                <span className="text-sm text-muted-foreground">All roles</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Include No Evals Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-no-evals"
              checked={filters.includeNoEvals}
              onCheckedChange={(checked) => onFiltersChange({
                ...filters,
                includeNoEvals: !!checked
              })}
            />
            <Label htmlFor="include-no-evals">Include staff with no evaluations</Label>
          </div>

          {/* Window Days Input */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="window-days">Window (days):</Label>
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
          </div>

        </div>
      </CardContent>
    </Card>
  );
}