import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Organization {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  program_start_date: string;
  cycle_length_weeks: number;
  organization_id: string;
  organization?: {
    name: string;
  };
}

interface LocationDialogProps {
  open: boolean;
  onClose: () => void;
  location?: Location | null;
}

const TIMEZONE_OPTIONS = [
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona Time (MST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' }
];

export function LocationDialog({ open, onClose, location }: LocationDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    organization_id: '',
    timezone: 'America/Chicago',
    program_start_date: '',
    cycle_length_weeks: 6
  });

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (location) {
      setFormData({
        name: location.name,
        slug: location.slug,
        organization_id: location.organization_id,
        timezone: location.timezone,
        program_start_date: location.program_start_date.split('T')[0], // Convert to YYYY-MM-DD format
        cycle_length_weeks: location.cycle_length_weeks
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        organization_id: '',
        timezone: 'America/Chicago',
        program_start_date: '',
        cycle_length_weeks: 6
      });
    }
  }, [location]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!location && formData.name) {
      const generatedSlug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setFormData(prev => ({ ...prev, slug: generatedSlug }));
    }
  }, [formData.name, location]);

  async function loadOrganizations() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load organizations',
        variant: 'destructive'
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate that program start date is a Monday
      const startDate = new Date(formData.program_start_date);
      const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      if (dayOfWeek !== 1) {
        toast({
          title: 'Invalid Date',
          description: 'Program start date must be a Monday',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      if (location) {
        // Update existing location
        const { error } = await supabase
          .from('locations')
          .update({
            name: formData.name,
            slug: formData.slug,
            organization_id: formData.organization_id,
            timezone: formData.timezone,
            program_start_date: formData.program_start_date,
            cycle_length_weeks: formData.cycle_length_weeks
          })
          .eq('id', location.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Location updated successfully'
        });
      } else {
        // Create new location
        const { error } = await supabase
          .from('locations')
          .insert({
            name: formData.name,
            slug: formData.slug,
            organization_id: formData.organization_id,
            timezone: formData.timezone,
            program_start_date: formData.program_start_date,
            cycle_length_weeks: formData.cycle_length_weeks
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Location created successfully'
        });
      }

      onClose();
    } catch (error: any) {
      console.error('Error saving location:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save location',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {location ? 'Edit Location' : 'Create Location'}
            </DialogTitle>
            <DialogDescription>
              {location 
                ? 'Update the location details below.'
                : 'Create a new location with its program schedule.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Select
                value={formData.organization_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, organization_id: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Location Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter location name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="location-slug"
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and dashes allowed"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="program_start_date">Program Start Date</Label>
              <Input
                id="program_start_date"
                type="date"
                value={formData.program_start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, program_start_date: e.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Must be a Monday. This anchors the week/cycle calculation for all staff at this location.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle_length_weeks">Cycle Length (Weeks)</Label>
              <Input
                id="cycle_length_weeks"
                type="number"
                min="1"
                max="12"
                value={formData.cycle_length_weeks}
                onChange={(e) => setFormData(prev => ({ ...prev, cycle_length_weeks: parseInt(e.target.value) || 6 }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Default is 6 weeks per cycle.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : location ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}