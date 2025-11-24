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
  confidenceStatus: string;
  performanceStatus: string;
  search: string;
  organizationOptions: FilterOption[];
  locationOptions: FilterOption[];
  roleOptions: FilterOption[];
  onChange: (filters: { organization: string; location: string; role: string; confidenceStatus: string; performanceStatus: string; search: string }) => void;
  onReset: () => void;
}

export function FiltersBar({
  organization,
  location,
  role,
  confidenceStatus,
  performanceStatus,
  search,
  organizationOptions,
  locationOptions,
  roleOptions,
  onChange,
  onReset,
}: FiltersBarProps) {
  const hasActiveFilters = useMemo(
    () => organization !== 'all' || location !== 'all' || role !== 'all' || confidenceStatus !== 'all' || performanceStatus !== 'all' || search.trim() !== '',
    [organization, location, role, confidenceStatus, performanceStatus, search]
  );

  const statusOptions: FilterOption[] = [
    { value: 'all', label: 'All' },
    { value: 'missing', label: 'Missing' },
    { value: 'late', label: 'Late' },
    { value: 'submitted', label: 'Submitted' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className="mb-2 block text-sm font-medium">Organization</label>
          <Select
            value={organization}
            onValueChange={(value) => onChange({ organization: value, location, role, confidenceStatus, performanceStatus, search })}
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
          <Select value={location} onValueChange={(value) => onChange({ organization, location: value, role, confidenceStatus, performanceStatus, search })}>
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
          <Select value={role} onValueChange={(value) => onChange({ organization, location, role: value, confidenceStatus, performanceStatus, search })}>
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
          <label className="mb-2 block text-sm font-medium">Confidence</label>
          <Select value={confidenceStatus} onValueChange={(value) => onChange({ organization, location, role, confidenceStatus: value, performanceStatus, search })}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Performance</label>
          <Select value={performanceStatus} onValueChange={(value) => onChange({ organization, location, role, confidenceStatus, performanceStatus: value, search })}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
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
            placeholder="Search staff..."
            value={search}
            onChange={(event) => onChange({ organization, location, role, confidenceStatus, performanceStatus, search: event.target.value })}
          />
        </div>
      </div>
      
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={onReset}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
