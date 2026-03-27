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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ARCHETYPE_OPTIONS, type ArchetypeCode } from '@/lib/roleArchetypes';

const PRACTICE_TYPE_OPTIONS = [
  { value: 'pediatric_us', label: 'Pediatric – US', slug: 'p_us' },
  { value: 'general_us',   label: 'General – US',   slug: 'gen_us' },
  { value: 'general_uk',   label: 'General – UK',   slug: 'gen_uk' },
] as const;

interface Role {
  role_id: number;
  role_name: string;
  role_code: string;
  archetype_code?: string | null;
  active: boolean;
  practice_type?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSaved: () => void;
}

interface FormValues {
  role_name: string;
  archetype_code: string;
  active: boolean;
  practice_type: string;
}

/** Derive a role_code from archetype + practice_type slug */
function deriveRoleCode(archetypeCode: string, practiceType: string): string {
  const slug = PRACTICE_TYPE_OPTIONS.find(p => p.value === practiceType)?.slug ?? practiceType;
  // Shorten archetype prefix for brevity
  const prefix = archetypeCode
    .replace('dental_assistant', 'assistant')
    .replace('practice_manager', 'manager')
    .replace('lead_dental_assistant', 'lead_da')
    .replace('treatment_coordinator', 'tco');
  return `${prefix}_${slug}`;
}

export function RoleFormDrawer({ open, onOpenChange, role, onSaved }: Props) {
  const isEditing = !!role;
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      role_name: '',
      archetype_code: '',
      active: true,
      practice_type: 'pediatric_us',
    },
  });

  const activeValue      = watch('active');
  const practiceTypeValue = watch('practice_type');
  const archetypeValue    = watch('archetype_code');

  // Auto-derived role_code (shown read-only)
  const derivedRoleCode = archetypeValue && practiceTypeValue
    ? deriveRoleCode(archetypeValue, practiceTypeValue)
    : '';

  useEffect(() => {
    if (open) {
      reset(role
        ? {
            role_name:      role.role_name,
            archetype_code: role.archetype_code ?? '',
            active:         role.active,
            practice_type:  role.practice_type ?? 'pediatric_us',
          }
        : { role_name: '', archetype_code: '', active: true, practice_type: 'pediatric_us' }
      );
    }
  }, [open, role, reset]);

  const onSubmit = async (values: FormValues) => {
    const role_code = isEditing ? role!.role_code : deriveRoleCode(values.archetype_code, values.practice_type);

    const payload = {
      role_name:      values.role_name,
      role_code,
      archetype_code: values.archetype_code || null,
      active:         values.active,
      practice_type:  values.practice_type,
    };

    if (isEditing) {
      const { error } = await supabase
        .from('roles')
        .update(payload)
        .eq('role_id', role!.role_id);
      if (error) { toast.error('Failed to update role: ' + error.message); return; }
      toast.success('Role updated');
    } else {
      const { error } = await supabase
        .from('roles')
        .insert(payload);
      if (error) { toast.error('Failed to create role: ' + error.message); return; }
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
            {isEditing
              ? 'Update role name, type, and status.'
              : 'Create a new role. Choose a role type first — it determines how the system treats this role.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">

          {/* Role type */}
          <div className="space-y-2">
            <Label>Role Type</Label>
            <Select
              value={archetypeValue}
              onValueChange={(v) => {
                setValue('archetype_code', v);
                // Pre-fill role name from label if blank
                const current = watch('role_name');
                if (!current) {
                  const opt = ARCHETYPE_OPTIONS.find(a => a.value === v);
                  if (opt) setValue('role_name', opt.label);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role type…" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {ARCHETYPE_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Role type controls system behavior (weekly cadence, planner tab, dual panel).
            </p>
          </div>

          {/* Display name */}
          <div className="space-y-2">
            <Label htmlFor="role_name">Display Name</Label>
            <Input
              id="role_name"
              {...register('role_name', { required: true })}
              placeholder="e.g. Dental Nurse"
            />
            <p className="text-xs text-muted-foreground">
              Platform-level name. Orgs can override this in their settings.
            </p>
          </div>

          {/* Practice type */}
          <div className="space-y-2">
            <Label>Practice Type</Label>
            <Select value={practiceTypeValue} onValueChange={(v) => setValue('practice_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {PRACTICE_TYPE_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-generated role code (read-only) */}
          <div className="space-y-2">
            <Label>Role Code <span className="text-muted-foreground font-normal">(auto-generated)</span></Label>
            <Input
              value={isEditing ? role!.role_code : derivedRoleCode}
              readOnly
              className="bg-muted/50 text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* Active */}
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Active</Label>
            <Switch
              id="active"
              checked={activeValue}
              onCheckedChange={(checked) => setValue('active', checked)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || (!isEditing && !archetypeValue)}>
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Role'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
