import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LocationDialog } from '@/components/admin/LocationDialog';
import { getLocationWeekContext } from '@/lib/locationState';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';

interface Location {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  program_start_date: string;
  cycle_length_weeks: number;
  organization_id: string;
  organization: {
    name: string;
  };
  currentWeek?: number;
  currentCycle?: number;
}

export default function LocationList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      // Check if user is super admin
      const { data: adminStatus } = await supabase
        .from('staff')
        .select('is_super_admin')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!adminStatus?.is_super_admin) {
        navigate('/');
        return;
      }

      // Load locations with organization info
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          organization:organizations(name)
        `)
        .order('name');

      if (error) throw error;

      // Calculate current week/cycle for each location
        const locationsWithWeekInfo = await Promise.all(
          (data || []).map(async (location: any) => {
            try {
              const context = await getLocationWeekContext(location.id);
              return {
                ...location,
                currentWeek: context.weekInCycle,
                currentCycle: context.cycleNumber,
                organization: location.organization || { name: "No organization" }
              } as Location;
            } catch (error) {
              console.error(`Error getting context for location ${location.id}:`, error);
              return {
                ...location,
                organization: location.organization || { name: "No organization" }
              } as Location;
            }
          })
        );

      setLocations(locationsWithWeekInfo);
    } catch (error) {
      console.error('Error loading locations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load locations',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  const { sortedData, sortConfig, handleSort } = useTableSort(locations);

  function handleCreate() {
    setEditingLocation(null);
    setDialogOpen(true);
  }

  function handleEdit(location: Location) {
    setEditingLocation(location);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditingLocation(null);
    loadLocations();
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Locations</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-32 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Locations</CardTitle>
              <CardDescription>Manage program locations and their schedules</CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No locations found</p>
              <Button onClick={handleCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create First Location
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort}>
                    Location
                  </SortableTableHead>
                  <SortableTableHead sortKey="organization.name" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort}>
                    Organization
                  </SortableTableHead>
                  <SortableTableHead sortKey="program_start_date" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort}>
                    Program Start
                  </SortableTableHead>
                  <SortableTableHead sortKey="currentWeek" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort}>
                    Current Week
                  </SortableTableHead>
                  <SortableTableHead sortKey="timezone" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort}>
                    Timezone
                  </SortableTableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{location.name}</div>
                        <div className="text-sm text-muted-foreground">{location.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>{location.organization?.name}</TableCell>
                    <TableCell>
                      {new Date(location.program_start_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {location.currentWeek && location.currentCycle ? (
                        <Badge variant="outline" className="text-xs">
                          Cycle {location.currentCycle} · Week {location.currentWeek}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {location.timezone}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(location)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LocationDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        location={editingLocation}
      />
    </div>
  );
}