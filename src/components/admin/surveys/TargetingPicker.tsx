import { MapPin, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAlcanTargets } from '@/hooks/useAlcanTargets';

interface Props {
  locationIds: string[];
  roleIds: number[];
  onChange: (next: { locationIds: string[]; roleIds: number[] }) => void;
}

/**
 * Location + role multi-select. An empty selection in a column means "no
 * filter on that dimension" (i.e. everyone) — surfaced in the column hint.
 */
export function TargetingPicker({ locationIds, roleIds, onChange }: Props) {
  const { locations, roles, isLoading } = useAlcanTargets();

  const toggleLoc = (id: string) =>
    onChange({
      roleIds,
      locationIds: locationIds.includes(id)
        ? locationIds.filter((x) => x !== id)
        : [...locationIds, id],
    });
  const toggleRole = (id: number) =>
    onChange({
      locationIds,
      roleIds: roleIds.includes(id) ? roleIds.filter((x) => x !== id) : [...roleIds, id],
    });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <MapPin className="h-4 w-4" />
          Locations
          <Badge variant="secondary" className="ml-1 text-xs">
            {locationIds.length === 0 ? 'All' : locationIds.length}
          </Badge>
        </div>
        <ScrollArea className="h-44">
          <div className="space-y-1.5 pr-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              locations.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`tl-${l.id}`}
                    checked={locationIds.includes(l.id)}
                    onCheckedChange={() => toggleLoc(l.id)}
                  />
                  <Label htmlFor={`tl-${l.id}`} className="cursor-pointer text-sm leading-tight">
                    {l.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <p className="mt-2 text-2xs text-muted-foreground">
          {locationIds.length === 0 ? 'Everyone, regardless of location.' : 'Only selected locations.'}
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Users className="h-4 w-4" />
          Roles
          <Badge variant="secondary" className="ml-1 text-xs">
            {roleIds.length === 0 ? 'All' : roleIds.length}
          </Badge>
        </div>
        <ScrollArea className="h-44">
          <div className="space-y-1.5 pr-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              roles.map((r) => (
                <div key={r.role_id} className="flex items-center gap-2">
                  <Checkbox
                    id={`tr-${r.role_id}`}
                    checked={roleIds.includes(r.role_id)}
                    onCheckedChange={() => toggleRole(r.role_id)}
                  />
                  <Label htmlFor={`tr-${r.role_id}`} className="cursor-pointer text-sm leading-tight">
                    {r.role_name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <p className="mt-2 text-2xs text-muted-foreground">
          {roleIds.length === 0 ? 'Everyone, regardless of role.' : 'Only selected roles.'}
        </p>
      </div>
    </div>
  );
}
