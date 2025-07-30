import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface StaffMember {
  id: string;
  name: string;
  role_name: string;
  location: string | null;
  conf_missing: number;
  perf_missing: number;
  last_updated: string | null;
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const { isCoach } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<StaffMember[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');

  // Redirect if not coach
  useEffect(() => {
    if (!loading && !isCoach) {
      navigate('/');
    }
  }, [isCoach, loading, navigate]);

  useEffect(() => {
    loadStaffData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [staff, selectedLocation, selectedRole]);

  const loadStaffData = async () => {
    try {
      // Get staff roster with score status
      const { data: staffData, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          location,
          role_id,
          roles!inner(role_name),
          weekly_scores(
            confidence_score,
            performance_score,
            updated_at,
            weekly_focus!inner(cycle, week_in_cycle)
          )
        `);

      if (error) throw error;

      // Process staff data to calculate missing scores
      const processedStaff: StaffMember[] = staffData.map(member => {
        const scores = member.weekly_scores || [];
        
        // Count missing scores for current week (assuming we're checking the latest week)
        const confMissing = scores.filter(s => s.confidence_score === null).length;
        const perfMissing = scores.filter(s => s.performance_score === null).length;
        
        // Get the latest update date
        const lastUpdated = scores.length > 0 
          ? Math.max(...scores.map(s => new Date(s.updated_at).getTime()))
          : null;

        return {
          id: member.id,
          name: member.name,
          role_name: (member.roles as any).role_name,
          location: member.location,
          conf_missing: confMissing,
          perf_missing: perfMissing,
          last_updated: lastUpdated ? new Date(lastUpdated).toISOString() : null
        };
      });

      setStaff(processedStaff);

      // Extract unique locations and roles for filters
      const uniqueLocations = [...new Set(processedStaff.map(s => s.location).filter(Boolean))];
      const uniqueRoles = [...new Set(processedStaff.map(s => s.role_name))];
      
      setLocations(uniqueLocations);
      setRoles(uniqueRoles);
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = staff;

    if (selectedLocation !== 'all') {
      filtered = filtered.filter(s => s.location === selectedLocation);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(s => s.role_name === selectedRole);
    }

    setFilteredStaff(filtered);
  };

  const getStatusBadge = (confMissing: number, perfMissing: number) => {
    if (confMissing === 3) {
      return null; // Grey - no badge shown
    } else if (perfMissing === 3) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-400">●</Badge>;
    } else {
      return <Badge variant="outline" className="text-green-600 border-green-400">✓</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Coach Dashboard</h1>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Coach Dashboard</h1>

      {/* Filters Bar */}
      <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4 mb-6">
        <div className="flex gap-4">
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(location => (
                <SelectItem key={location} value={location}>{location}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Positions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Positions</SelectItem>
              {roles.map(role => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Staff List */}
      <div className="grid gap-4">
        {filteredStaff.map(member => (
          <Card 
            key={member.id} 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/coach/${member.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-semibold">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.role_name}</p>
                  </div>
                  {getStatusBadge(member.conf_missing, member.perf_missing)}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {formatDate(member.last_updated)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredStaff.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No staff members match the selected filters.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}