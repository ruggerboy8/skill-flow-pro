import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OrganizationDialog } from '@/components/admin/OrganizationDialog';

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  location_count?: number;
}

export default function OrganizationList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
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

      // Load organizations with location count
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          locations(count)
        `)
        .order('name');

      if (error) throw error;

      const orgsWithCount = data?.map(org => ({
        ...org,
        location_count: org.locations?.length || 0
      })) || [];

      setOrganizations(orgsWithCount);
    } catch (error) {
      console.error('Error loading organizations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load organizations',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditingOrg(null);
    setDialogOpen(true);
  }

  function handleEdit(org: Organization) {
    setEditingOrg(org);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditingOrg(null);
    loadOrganizations();
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
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
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Manage organizations and their locations</CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Organization
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No organizations found</p>
              <Button onClick={handleCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create First Organization
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                    <TableCell>{org.location_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(org.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(org)}
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

      <OrganizationDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        organization={editingOrg}
      />
    </div>
  );
}