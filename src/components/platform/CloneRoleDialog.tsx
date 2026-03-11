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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Role {
  role_id: number;
  role_name: string;
  role_code: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  onCloned: (newRoleId: number) => void;
}

export function CloneRoleDialog({ open, onOpenChange, roles, onCloned }: Props) {
  const [sourceRoleId, setSourceRoleId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  const handleClone = async () => {
    if (!sourceRoleId || !newName || !newCode) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsCloning(true);
    try {
      // 1. Create new role
      const { data: newRole, error: roleErr } = await supabase
        .from('roles')
        .insert({ role_name: newName, role_code: newCode })
        .select('role_id')
        .single();

      if (roleErr) throw roleErr;

      // 2. Fetch source competencies
      const { data: sourceComps, error: compErr } = await supabase
        .from('competencies')
        .select('domain_id, name, code, tagline, description, friendly_description, interview_prompt, status')
        .eq('role_id', Number(sourceRoleId));

      if (compErr) throw compErr;

      // 3. Bulk insert cloned competencies with adjusted code prefix
      if (sourceComps && sourceComps.length > 0) {
        const sourceRole = roles.find((r) => r.role_id === Number(sourceRoleId));
        const sourcePrefix = sourceRole?.role_code ?? '';

        const cloned = sourceComps.map((c) => ({
          ...c,
          role_id: newRole.role_id,
          code: c.code ? c.code.replace(new RegExp(`^${sourcePrefix}\\.`), `${newCode}.`) : c.code,
        }));

        const { error: insertErr } = await supabase.from('competencies').insert(cloned);
        if (insertErr) throw insertErr;
      }

      toast.success(`Cloned "${newName}" with ${sourceComps?.length ?? 0} competencies`);
      onCloned(newRole.role_id);
      setSourceRoleId('');
      setNewName('');
      setNewCode('');
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
          <DialogTitle>Clone Role</DialogTitle>
          <DialogDescription>
            Duplicate all competencies from an existing role into a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Source Role</Label>
            <Select value={sourceRoleId} onValueChange={setSourceRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select role to clone" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.role_id} value={String(r.role_id)}>
                    {r.role_name} ({r.role_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New Role Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dental Nurse" />
          </div>
          <div className="space-y-2">
            <Label>New Role Code</Label>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="e.g. DN" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleClone} disabled={isCloning || !sourceRoleId || !newName || !newCode}>
            {isCloning ? 'Cloning…' : 'Clone Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
