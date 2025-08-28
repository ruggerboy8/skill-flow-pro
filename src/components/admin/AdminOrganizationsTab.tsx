import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, MoreHorizontal, Edit, Archive } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OrganizationFormDrawer } from "./OrganizationFormDrawer";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Organization {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export function AdminOrganizationsTab() {
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("name");

      if (error) throw error;

      setOrganizations(data || []);
    } catch (error) {
      console.error("Error loading organizations:", error);
      toast({
        title: "Error",
        description: "Failed to load organizations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const handleNewOrganization = () => {
    setSelectedOrganization(null);
    setDrawerOpen(true);
  };

  const handleEditOrganization = (organization: Organization) => {
    setSelectedOrganization(organization);
    setDrawerOpen(true);
  };

  const handleFormSuccess = () => {
    setDrawerOpen(false);
    setSelectedOrganization(null);
    loadOrganizations();
  };

  const toggleOrganizationActive = async (organization: Organization) => {
    // Check if organization has active locations before archiving
    if (organization.active) {
      const { count } = await supabase
        .from("locations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("active", true);

      if (count && count > 0) {
        toast({
          title: "Cannot Archive",
          description: "This organization has active locations. Please reassign or remove them first.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ active: !organization.active })
        .eq("id", organization.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Organization ${organization.active ? "archived" : "activated"} successfully`,
      });

      loadOrganizations();
    } catch (error) {
      console.error("Error updating organization:", error);
      toast({
        title: "Error",
        description: "Failed to update organization",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Manage organizations and their settings</CardDescription>
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
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Manage organizations and their settings</CardDescription>
            </div>
            <Button onClick={handleNewOrganization}>
              <Plus className="h-4 w-4 mr-2" />
              New Organization
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No organizations found
                    </TableCell>
                  </TableRow>
                ) : (
                  organizations.map((organization) => (
                    <TableRow key={organization.id}>
                      <TableCell className="font-medium">{organization.name}</TableCell>
                      <TableCell>{formatDate(organization.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={organization.active}
                            onCheckedChange={() => toggleOrganizationActive(organization)}
                          />
                          <Badge variant={organization.active ? "default" : "secondary"}>
                            {organization.active ? "Active" : "Archived"}
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
                            <DropdownMenuItem onClick={() => handleEditOrganization(organization)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleOrganizationActive(organization)}>
                              <Archive className="h-4 w-4 mr-2" />
                              {organization.active ? "Archive" : "Unarchive"}
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

      <OrganizationFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedOrganization(null);
        }}
        onSuccess={handleFormSuccess}
        organization={selectedOrganization}
      />
    </>
  );
}