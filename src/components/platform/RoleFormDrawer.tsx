import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Role {
  role_id: number;
  role_name: string;
  role_code: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSaved: () => void;
}

interface FormValues {
  role_name: string;
  role_code: string;
  active: boolean;
}

export function RoleFormDrawer({ open, onOpenChange, role, onSaved }: Props) {
  const isEditing = !!role;
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { role_name: '', role_code: '', active: true },
  });

  const activeValue = watch('active');

  useEffect(() => {
    if (open) {
      reset(role ? { role_name: role.role_name, role_code: role.role_code, active: role.active } : { role_name: '', role_code: '', active: true });
    }
  }, [open, role, reset]);

  const onSubmit = async (values: FormValues) => {
    if (isEditing) {
      const { error } = await supabase
        .from('roles')
        .update({ role_name: values.role_name, role_code: values.role_code, active: values.active })
        .eq('role_id', role!.role_id);
      if (error) {
        toast.error('Failed to update role: ' + error.message);
        return;
      }
      toast.success('Role updated');
    } else {
      const { error } = await supabase
        .from('roles')
        .insert({ role_name: values.role_name, role_code: values.role_code, active: values.active });
      if (error) {
        toast.error('Failed to create role: ' + error.message);
        return;
      }
      toast.success('Role created');
    }
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Role' : 'New Role'}</SheetTitle>
          <SheetDescription>
            {isEditing ? 'Update role name, code, and status.' : 'Create a new role. You can add competencies after.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="role_name">Role Name</Label>
            <Input id="role_name" {...register('role_name', { required: true })} placeholder="e.g. Receptionist" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role_code">Role Code</Label>
            <Input id="role_code" {...register('role_code', { required: true })} placeholder="e.g. REC" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Active</Label>
            <Switch
              id="active"
              checked={activeValue}
              onCheckedChange={(checked) => setValue('active', checked)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Role'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
