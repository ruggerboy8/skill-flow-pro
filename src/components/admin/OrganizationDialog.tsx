import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface OrganizationDialogProps {
  open: boolean;
  onClose: () => void;
  organization?: Organization | null;
}

export function OrganizationDialog({ open, onClose, organization }: OrganizationDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: ''
  });

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        slug: organization.slug
      });
    } else {
      setFormData({
        name: '',
        slug: ''
      });
    }
  }, [organization]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!organization && formData.name) {
      const generatedSlug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setFormData(prev => ({ ...prev, slug: generatedSlug }));
    }
  }, [formData.name, organization]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (organization) {
        // Update existing organization
        const { error } = await supabase
          .from('organizations')
          .update({
            name: formData.name,
            slug: formData.slug
          })
          .eq('id', organization.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Organization updated successfully'
        });
      } else {
        // Create new organization
        const { error } = await supabase
          .from('organizations')
          .insert({
            name: formData.name,
            slug: formData.slug
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Organization created successfully'
        });
      }

      onClose();
    } catch (error: any) {
      console.error('Error saving organization:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save organization',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {organization ? 'Edit Organization' : 'Create Organization'}
            </DialogTitle>
            <DialogDescription>
              {organization 
                ? 'Update the organization details below.'
                : 'Create a new organization to manage locations and staff.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter organization name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="organization-slug"
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and dashes allowed"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and system references. Only lowercase letters, numbers, and dashes.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : organization ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}