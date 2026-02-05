import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface InviteDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InviteDoctorDialog({ open, onOpenChange, onSuccess }: InviteDoctorDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [locationId, setLocationId] = useState('__roaming__');

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ['organizations-for-invite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch locations for selected org
  const { data: locations } = useQuery({
    queryKey: ['locations-for-invite', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/admin-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'invite_doctor',
            email: email.trim(),
            name: name.trim(),
            organization_id: organizationId,
            location_id: locationId === '__roaming__' ? null : locationId,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to invite doctor');
      }
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Doctor Invited',
        description: `An invitation has been sent to ${email}`,
      });
      queryClient.invalidateQueries({ queryKey: ['doctor-stats'] });
      queryClient.invalidateQueries({ queryKey: ['doctors-management'] });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to invite doctor',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setEmail('');
    setName('');
    setOrganizationId('');
    setLocationId('__roaming__');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !organizationId) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    inviteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Doctor</DialogTitle>
          <DialogDescription>
            Send an invitation to a doctor to join the program.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization">Organization *</Label>
            <Select value={organizationId} onValueChange={(val) => {
              setOrganizationId(val);
              setLocationId('__roaming__'); // Reset location when org changes
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location (Optional)</Label>
            <Select value={locationId} onValueChange={setLocationId} disabled={!organizationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__roaming__">
                  <span className="italic">Roaming / Multiple Locations</span>
                </SelectItem>
                {locations?.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave as "Roaming" for doctors who work at multiple locations
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}