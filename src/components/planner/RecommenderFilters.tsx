import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Filter } from 'lucide-react';
import type { FilterState } from '@/lib/recommenderUtils';

interface RecommenderFiltersProps {
  value: FilterState;
  onChange: (value: FilterState) => void;
  sort: 'need' | 'lowConf' | 'weeks' | 'domain';
  onSortChange: (sort: 'need' | 'lowConf' | 'weeks' | 'domain') => void;
  availableDomains: string[];
}

export function RecommenderFilters({ 
  value, 
  onChange, 
  sort, 
  onSortChange,
  availableDomains 
}: RecommenderFiltersProps) {
  const [open, setOpen] = useState(false);

  const toggleSignal = (signal: 'low_conf' | 'retest' | 'stale' | 'never') => {
    const current = value.signals || [];
    const updated = current.includes(signal)
      ? current.filter(s => s !== signal)
      : [...current, signal];
    onChange({ ...value, signals: updated });
  };

  const toggleDomain = (domain: string) => {
    const current = value.domains || [];
    const updated = current.includes(domain)
      ? current.filter(d => d !== domain)
      : [...current, domain];
    onChange({ ...value, domains: updated });
  };

  const activeCount = (value.signals?.length || 0) + (value.domains?.length || 0);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Signals</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={value.signals?.includes('low_conf') || false}
          onCheckedChange={() => toggleSignal('low_conf')}
        >
          Low confidence (≥33%)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={value.signals?.includes('retest') || false}
          onCheckedChange={() => toggleSignal('retest')}
        >
          Retest due
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={value.signals?.includes('stale') || false}
          onCheckedChange={() => toggleSignal('stale')}
        >
          Not seen lately (≥8 weeks)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={value.signals?.includes('never') || false}
          onCheckedChange={() => toggleSignal('never')}
        >
          Never practiced
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Domains</DropdownMenuLabel>
        {availableDomains.map(domain => (
          <DropdownMenuCheckboxItem
            key={domain}
            checked={value.domains?.includes(domain) || false}
            onCheckedChange={() => toggleDomain(domain)}
          >
            {domain}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as any)}>
          <DropdownMenuRadioItem value="need">
            Need (default)
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="lowConf">
            Low-confidence share
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="weeks">
            Weeks since practiced
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="domain">
            Domain (A→Z)
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        {activeCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full"
              onClick={() => onChange({ signals: [], domains: [] })}
            >
              Clear all
            </Button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
