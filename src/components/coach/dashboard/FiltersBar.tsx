import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FiltersBarProps {
  organization: string;
  location: string;
  role: string;
  search: string;
  organizationOptions: FilterOption[];
  locationOptions: FilterOption[];
  roleOptions: FilterOption[];
  onChange: (filters: { organization: string; location: string; role: string; search: string }) => void;
  onReset: () => void;
}

export function FiltersBar({
  organization,
  location,
  role,
  search,
  organizationOptions,
  locationOptions,
  roleOptions,
  onChange,
  onReset,
}: FiltersBarProps) {
  const hasActiveFilters = useMemo(
    () => organization !== 'all' || location !== 'all' || role !== 'all' || search.trim() !== '',
    [organization, location, role, search]
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div>
        <label className="mb-2 block text-sm font-medium">Organization</label>
        <Select
          value={organization}
          onValueChange={(value) => onChange({ organization: value, location, role, search })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All organizations" />
          </SelectTrigger>
          <SelectContent>
            {organizationOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Location</label>
        <Select value={location} onValueChange={(value) => onChange({ organization, location: value, role, search })}>
          <SelectTrigger>
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            {locationOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Role</label>
        <Select value={role} onValueChange={(value) => onChange({ organization, location, role: value, search })}>
          <SelectTrigger>
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Search</label>
        <Input
          placeholder="Search staff, location, or role"
          value={search}
          onChange={(event) => onChange({ organization, location, role, search: event.target.value })}
        />
        {hasActiveFilters && (
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onReset}>
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
