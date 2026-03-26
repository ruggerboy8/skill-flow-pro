import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Role {
  role_id: number;
  role_name: string;
  role_code: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  targetRoleId: number;
  targetRoleCode: string;
  onCloned: () => void;
}

export function CloneCompetenciesDialog({ open, onOpenChange, roles, targetRoleId, targetRoleCode, onCloned }: Props) {
  const [sourceRoleId, setSourceRoleId] = useState<string>('');
  const [isCloning, setIsCloning] = useState(false);

  const availableRoles = roles.filter((r) => r.role_id !== targetRoleId);

  const handleClone = async () => {
    if (!sourceRoleId) {
      toast.error('Please select a source role');
      return;
    }

    setIsCloning(true);
    try {
      const { data: sourceComps, error: compErr } = await supabase
        .from('competencies')
        .select('domain_id, name, code, tagline, description, friendly_description, interview_prompt, status')
        .eq('role_id', Number(sourceRoleId));

      if (compErr) throw compErr;

      if (!sourceComps || sourceComps.length === 0) {
        toast.error('Source role has no competencies to clone');
        return;
      }

      const sourceRole = roles.find((r) => r.role_id === Number(sourceRoleId));
      const sourcePrefix = sourceRole?.role_code ?? '';

      const cloned = sourceComps.map((c) => ({
        ...c,
        role_id: targetRoleId,
        code: c.code ? c.code.replace(new RegExp(`^${sourcePrefix}\\.`), `${targetRoleCode}.`) : c.code,
      }));

      const { error: insertErr } = await supabase.from('competencies').insert(cloned);
      if (insertErr) throw insertErr;

      toast.success(`Cloned ${sourceComps.length} competencies`);
      onCloned();
      setSourceRoleId('');
    } catch (err: any) {
      toast.error('Clone failed: ' + err.message);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone Competencies</DialogTitle>
          <DialogDescription>
            Copy all competencies from another role into this one. Code prefixes will be updated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Clone from</Label>
            <Select value={sourceRoleId} onValueChange={setSourceRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.role_id} value={String(r.role_id)}>
                    {r.role_name} ({r.role_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleClone} disabled={isCloning || !sourceRoleId}>
            {isCloning ? 'Cloning…' : 'Clone Competencies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
