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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Competency {
  competency_id: number;
  role_id: number;
  domain_id: number;
  name: string;
  code: string | null;
  tagline: string | null;
  description: string | null;
  friendly_description: string | null;
  interview_prompt: string | null;
}

interface Domain {
  domain_id: number;
  domain_name: string;
  color_hex: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competency: Competency | null;
  roleId: number;
  domains: Domain[];
  onSaved: () => void;
}

interface FormValues {
  name: string;
  tagline: string;
  description: string;
  friendly_description: string;
  interview_prompt: string;
  domain_id: string;
}

export function CompetencyFormDrawer({ open, onOpenChange, competency, roleId, domains, onSaved }: Props) {
  const isEditing = !!competency;
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      name: '', tagline: '', description: '',
      friendly_description: '', interview_prompt: '', domain_id: '',
    },
  });

  const domainValue = watch('domain_id');

  useEffect(() => {
    if (open) {
      if (competency) {
        reset({
          name: competency.name ?? '',
          tagline: competency.tagline ?? '',
          description: competency.description ?? '',
          friendly_description: competency.friendly_description ?? '',
          interview_prompt: competency.interview_prompt ?? '',
          domain_id: String(competency.domain_id),
        });
      } else {
        reset({
          name: '', tagline: '', description: '',
          friendly_description: '', interview_prompt: '',
          domain_id: domains[0] ? String(domains[0].domain_id) : '',
        });
      }
    }
  }, [open, competency, domains, reset]);

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      tagline: values.tagline || null,
      description: values.description || null,
      friendly_description: values.friendly_description || null,
      interview_prompt: values.interview_prompt || null,
      domain_id: Number(values.domain_id),
      role_id: roleId,
    };

    if (isEditing) {
      const { error } = await supabase
        .from('competencies')
        .update(payload)
        .eq('competency_id', competency!.competency_id);
      if (error) {
        toast.error('Failed to update: ' + error.message);
        return;
      }
      toast.success('Competency updated');
    } else {
      const { error } = await supabase.from('competencies').insert(payload);
      if (error) {
        toast.error('Failed to create: ' + error.message);
        return;
      }
      toast.success('Competency created');
    }
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Competency' : 'New Competency'}</SheetTitle>
          <SheetDescription>
            {isEditing ? 'Update the competency fields below.' : 'Add a new competency to this role.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>Domain</Label>
            <Select value={domainValue} onValueChange={(v) => setValue('domain_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d.domain_id} value={String(d.domain_id)}>
                    {d.domain_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...register('name', { required: true })} placeholder="e.g. Patient Flow Coordination" />
          </div>
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input {...register('tagline')} placeholder="Short label" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...register('description')} rows={3} placeholder="Full description…" />
          </div>
          <div className="space-y-2">
            <Label>Friendly Description</Label>
            <Textarea {...register('friendly_description')} rows={3} placeholder="Learner-facing description…" />
          </div>
          <div className="space-y-2">
            <Label>Interview Prompt</Label>
            <Textarea {...register('interview_prompt')} rows={3} placeholder="Coaching prompt…" />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Competency'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
