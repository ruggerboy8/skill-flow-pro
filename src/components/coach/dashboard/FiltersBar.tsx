import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
}

interface FiltersBarProps {
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
  const hasActiveFilters = organization !== 'all' || location !== 'all' || role !== 'all' || search.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Organization</label>
          <Select
            value={organization}
            onValueChange={(val) => onChange({ organization: val, location, role, search })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Location</label>
          <Select
            value={location}
            onValueChange={(val) => onChange({ organization, location: val, role, search })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Role</label>
          <Select
            value={role}
            onValueChange={(val) => onChange({ organization, location, role: val, search })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Search</label>
          <Input
            placeholder="Search staff, location, role..."
            value={search}
            onChange={(e) => onChange({ organization, location, role, search: e.target.value })}
          />
        </div>
      </div>

      {hasActiveFilters && (
        <Button variant="outline" size="sm" onClick={onReset}>
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
