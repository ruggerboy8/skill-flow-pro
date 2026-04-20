import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface Props {
  doctorStaffId: string;
  currentLocationId: string | null;
  currentLocationName: string | null;
}

const ROAMING_VALUE = '__roaming__';

/**
 * Inline editor for a doctor's primary_location_id.
 * Visible to clinical directors and super admins.
 */
export function DoctorLocationEditor({
  doctorStaffId,
  currentLocationId,
  currentLocationName,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useStaffProfile();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(currentLocationId ?? ROAMING_VALUE);

  const canEdit = !!me && (me.is_clinical_director || me.is_super_admin || me.is_org_admin);

  const { data: locations, isLoading: locsLoading } = useQuery({
    queryKey: ['doctor-editor-locations', me?.organization_id],
    queryFn: async () => {
      // Show locations within the same org as the editor, scoped via practice_groups.
      const { data: groups, error: gErr } = await supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', me!.organization_id!);
      if (gErr) throw gErr;

      const groupIds = (groups ?? []).map((g) => g.id);
      if (groupIds.length === 0) return [];

      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .in('group_id', groupIds)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!me?.organization_id,
  });

  const mutation = useMutation({
    mutationFn: async (newLocationId: string | null) => {
      const { error } = await supabase
        .from('staff')
        .update({ primary_location_id: newLocationId })
        .eq('id', doctorStaffId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Location updated' });
      qc.invalidateQueries({ queryKey: ['doctor-detail', doctorStaffId] });
      qc.invalidateQueries({ queryKey: ['doctors'] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: 'Could not update location',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  if (!canEdit) return null;

  const handleSave = () => {
    const newId = selected === ROAMING_VALUE ? null : selected;
    if (newId === (currentLocationId ?? null)) {
      setOpen(false);
      return;
    }
    mutation.mutate(newId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Edit doctor location"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-medium">Edit primary location</p>
          <p className="text-xs text-muted-foreground">
            Currently: {currentLocationName ?? 'Roaming'}
          </p>
        </div>
        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={locsLoading || mutation.isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder={locsLoading ? 'Loading…' : 'Select location'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROAMING_VALUE}>Roaming (no location)</SelectItem>
            {(locations ?? []).map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
