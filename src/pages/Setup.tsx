import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Role {
  role_id: number;
  role_name: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface Location {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
}

export default function Setup() {
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState<string>('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [participationChoice, setParticipationChoice] = useState<"experienced"|"new"|"">("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadRoles();
    loadOrganizations();
    loadLocations();
  }, []);

  // Filter locations when organization changes
  useEffect(() => {
    if (selectedOrganizationId) {
      const filtered = locations.filter(loc => loc.organization_id === selectedOrganizationId);
      setAvailableLocations(filtered);
      setSelectedLocationId(''); // Reset location selection
    } else {
      setAvailableLocations([]);
    }
  }, [selectedOrganizationId, locations]);

  const loadRoles = async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load roles",
        variant: "destructive"
      });
    } else {
      setRoles(data || []);
    }
  };

  const loadOrganizations = async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('active', true)
      .order('name');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load organizations",
        variant: "destructive"
      });
    } else {
      setOrganizations(data || []);
    }
  };

  const loadLocations = async () => {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('active', true)
      .order('name');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load locations",
        variant: "destructive"
      });
    } else {
      setLocations(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !roleId || !selectedOrganizationId || !selectedLocationId || !participationChoice || !user) return;

    setLoading(true);
    
    // Create staff record
    const { error } = await supabase
      .from('staff')
      .insert({
        user_id: user.id,
        email: user.email!,
        name,
        role_id: parseInt(roleId),
        primary_location_id: selectedLocationId
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    // Update participation decision
    const isNew = participationChoice === "new";
    const { error: updateError } = await supabase
      .from('staff')
      .update({
        participation_start_at: isNew ? new Date().toISOString() : null,
      })
      .eq('user_id', user.id);

    if (updateError) {
      toast({
        title: "Error",
        description: updateError.message,
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    // Clear any stale backfill local state
    localStorage.removeItem("backfillDone");
    localStorage.removeItem("backfillProgress");
    localStorage.removeItem("bf_ts_fixed");

    toast({
      title: "Profile created",
      description: "Welcome to ProMoves!"
    });

    // Route based on choice
    if (isNew) {
      navigate('/', { replace: true });
    } else {
      navigate('/backfill', { replace: true });
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Complete Your Profile</CardTitle>
          <CardDescription>
            Let's set up your ProMoves profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={roleId} onValueChange={setRoleId} required>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.role_id} value={role.role_id.toString()}>
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Select value={selectedOrganizationId} onValueChange={setSelectedOrganizationId} required>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select your organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Primary Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId} required disabled={!selectedOrganizationId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select your primary location" />
                </SelectTrigger>
                <SelectContent>
                  {availableLocations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="participation">How are you joining?</Label>
              <Select value={participationChoice} onValueChange={(v) => setParticipationChoice(v as any)} required>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select one..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="experienced">
                    I have been participating in ProMoves meetings for the past 6 weeks
                  </SelectItem>
                  <SelectItem value="new">
                    I'm new! This is my first time doing any of this
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12" 
              disabled={loading || !name || !roleId || !selectedOrganizationId || !selectedLocationId || !participationChoice}
            >
              {loading ? "Creating Profile..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}