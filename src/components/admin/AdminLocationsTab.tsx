import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, MoreHorizontal, Edit, Archive } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LocationFormDrawer } from "./LocationFormDrawer";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocationWeekContext } from "@/lib/locationState";

interface Location {
  id: string;
  name: string;
  organization_id: string | null;
  timezone: string;
  program_start_date: string;
  cycle_length_weeks: number;
  active: boolean;
  organization?: {
    name: string;
  };
  currentWeek?: number;
  currentCycle?: number;
}

interface Organization {
  id: string;
  name: string;
}

export function AdminLocationsTab() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("locations")
        .select(`
          id, name, organization_id, timezone, program_start_date, cycle_length_weeks, active,
          organization:organizations!locations_organization_id_fkey ( id, name )
        `)
        .order("name");

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
            } as Location;
          } catch (error) {
            console.error(`Error getting context for location ${location.id}:`, error);
            return {
              ...location,
            } as Location;
          }
        })
      );

      setLocations(locationsWithWeekInfo);
    } catch (error) {
      console.error("Error loading locations:", error);
      toast({
        title: "Error",
        description: "Failed to load locations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (error) throw error;

      setOrganizations(data || []);
    } catch (error) {
      console.error("Error loading organizations:", error);
    }
  };

  useEffect(() => {
    loadLocations();
    loadOrganizations();
  }, []);

  const handleNewLocation = () => {
    setSelectedLocation(null);
    setDrawerOpen(true);
  };

  const handleEditLocation = (location: Location) => {
    setSelectedLocation(location);
    setDrawerOpen(true);
  };

  const handleFormSuccess = () => {
    setDrawerOpen(false);
    setSelectedLocation(null);
    loadLocations();
  };

  const toggleLocationActive = async (location: Location) => {
    try {
      if (location.active) {
        // about to archive; block if staff still assigned
        const { count, error: cntErr } = await supabase
          .from("staff")
          .select("*", { count: "exact", head: true })
          .eq("primary_location_id", location.id);

        if (cntErr) throw cntErr;

        if ((count ?? 0) > 0) {
          toast({
            title: "Cannot archive",
            description: "This location still has staff assigned. Reassign their primary location first.",
            variant: "destructive",
          });
          return;
        }
      }

      const { error } = await supabase
        .from("locations")
        .update({ active: !location.active })
        .eq("id", location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Location ${location.active ? "archived" : "activated"} successfully`,
      });

      loadLocations();
    } catch (error) {
      console.error("Error updating location:", error);
      toast({
        title: "Error",
        description: "Failed to update location",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };

  const formatTimezone = (timezone: string) => {
    const timezoneMap: { [key: string]: string } = {
      'America/New_York': 'Eastern',
      'America/Chicago': 'Central',
      'America/Denver': 'Mountain',
      'America/Phoenix': 'Mountain (no DST)',
      'America/Los_Angeles': 'Pacific',
      'America/Anchorage': 'Alaska',
      'Pacific/Honolulu': 'Hawaii',
      'America/Halifax': 'Atlantic',
      'America/St_Johns': 'Newfoundland',
      'America/Toronto': 'Eastern',
      'America/Edmonton': 'Mountain',
      'America/Vancouver': 'Pacific',
    };
    
    return timezoneMap[timezone] || timezone;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Program Locations</CardTitle>
              <CardDescription>Manage program locations and settings</CardDescription>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Program Locations</CardTitle>
              <CardDescription>Manage program locations and settings</CardDescription>
            </div>
            <Button onClick={handleNewLocation}>
              <Plus className="h-4 w-4 mr-2" />
              New Location
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Program Start</TableHead>
                  <TableHead>Current Week</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No locations found
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell>
                        {location.organization?.name || "No organization"}
                      </TableCell>
                      <TableCell>{formatTimezone(location.timezone)}</TableCell>
                      <TableCell>{formatDate(location.program_start_date)}</TableCell>
                      <TableCell>
                        {(() => {
                          const today = new Date();
                          const startDate = new Date(location.program_start_date);
                          
                          if (startDate > today) {
                            return (
                              <Badge variant="secondary" className="text-xs">
                                Not Started
                              </Badge>
                            );
                          }
                          
                          if (location.currentWeek && location.currentCycle) {
                            return (
                              <Badge variant="outline" className="text-xs">
                                C:{location.currentCycle} W:{location.currentWeek}
                              </Badge>
                            );
                          }
                          
                          return <span className="text-muted-foreground">—</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={location.active}
                            onCheckedChange={() => toggleLocationActive(location)}
                          />
                          <Badge variant={location.active ? "default" : "secondary"}>
                            {location.active ? "Active" : "Archived"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditLocation(location)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleLocationActive(location)}>
                              <Archive className="h-4 w-4 mr-2" />
                              {location.active ? "Archive" : "Unarchive"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LocationFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLocation(null);
        }}
        onSuccess={handleFormSuccess}
        location={selectedLocation}
        organizations={organizations}
      />
    </>
  );
}