import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, UserCheck, X } from 'lucide-react';
import { useSim } from '@/devtools/SimProvider';
import { useToast } from '@/hooks/use-toast';

interface OrgOption {
  id: string;
  name: string;
}

interface AdminStaff {
  id: string;
  name: string | null;
}

export function ImpersonationTab() {
  const { overrides, updateOverrides, resetSimulation } = useSim();
  const { toast } = useToast();

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [admins, setAdmins] = useState<AdminStaff[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [activeMasqueradeName, setActiveMasqueradeName] = useState<string>('');

  // Load org list on mount
  useEffect(() => {
    const loadOrgs = async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');
      if (!error) setOrgs(data ?? []);
      setLoadingOrgs(false);
    };
    loadOrgs();
  }, []);

  // Load org admins when selected org changes
  useEffect(() => {
    if (!selectedOrgId) {
      setAdmins([]);
      return;
    }

    const loadAdmins = async () => {
      setLoadingAdmins(true);
      try {
        // Step 1: groups for this org
        const { data: groups } = await supabase
          .from('practice_groups')
          .select('id')
          .eq('organization_id', selectedOrgId);

        const groupIds = (groups ?? []).map((g) => g.id);
        if (groupIds.length === 0) {
          setAdmins([]);
          return;
        }

        // Step 2: active locations for those groups
        const { data: locations } = await supabase
          .from('locations')
          .select('id')
          .in('group_id', groupIds)
          .eq('active', true);

        const locationIds = (locations ?? []).map((l) => l.id);
        if (locationIds.length === 0) {
          setAdmins([]);
          return;
        }

        // Step 3: active staff in those locations, with capabilities
        const staffQuery = supabase
          .from('staff')
          .select('id, name, is_org_admin, user_capabilities(is_org_admin)');
        const { data: staffData, error } = await (staffQuery as any)
          .in('primary_location_id', locationIds)
          .eq('active', true);

        if (error) throw error;

        // Filter for org admins (new caps row OR legacy flag)
        const orgAdmins = (staffData ?? []).filter((s: any) => {
          const caps = Array.isArray(s.user_capabilities)
            ? s.user_capabilities[0]
            : (s.user_capabilities as { is_org_admin: boolean } | null);
          return s.is_org_admin || caps?.is_org_admin;
        });

        setAdmins(orgAdmins.map((s: any) => ({ id: s.id, name: s.name })));
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to load org admins',
          variant: 'destructive',
        });
      } finally {
        setLoadingAdmins(false);
      }
    };

    loadAdmins();
  }, [selectedOrgId, toast]);

  const handleMasquerade = (admin: AdminStaff) => {
    updateOverrides({ enabled: true, masqueradeStaffId: admin.id });
    setActiveMasqueradeName(admin.name ?? admin.id);
    toast({
      title: 'Simulation active',
      description: `Viewing as ${admin.name ?? admin.id}`,
    });
  };

  const handleClear = () => {
    resetSimulation();
    toast({ title: 'Simulation cleared', description: 'Returned to your own platform admin view' });
  };

  const [activeMasqueradeName, setActiveMasqueradeName] = useState<string>('');
  const activeMasquerade = overrides.enabled && overrides.masqueradeStaffId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impersonation</CardTitle>
        <CardDescription>
          View the platform as an org admin. Affects your browser session only — no data is
          modified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active masquerade banner */}
        {activeMasquerade && (
          <Alert className="border-orange-400 bg-orange-50 text-orange-900 [&>svg]:text-orange-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Simulation active</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                Masquerading as{' '}
                <strong>{activeMasqueradeName || overrides.masqueradeStaffId}</strong>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                className="shrink-0 border-orange-400 text-orange-800 hover:bg-orange-100"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Org picker */}
        <div className="space-y-2 max-w-xs">
          <label className="text-sm font-medium">Organization</label>
          {loadingOrgs ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an organization…" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Org admin list */}
        {selectedOrgId && (
          <div>
            <p className="text-sm font-medium mb-3">Org admins</p>
            {loadingAdmins ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No org admins found for this organization. Invite one from the Admin panel.
              </p>
            ) : (
              <div className="space-y-2">
                {admins.map((admin) => {
                  const isActive =
                    overrides.masqueradeStaffId === admin.id && overrides.enabled;
                  return (
                    <div
                      key={admin.id}
                      className="flex items-center justify-between p-3 rounded-md border"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">
                          {admin.name ?? 'Unnamed'}
                        </span>
                        {isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isActive ? 'secondary' : 'outline'}
                        onClick={() => handleMasquerade(admin)}
                      >
                        {isActive ? 'Active' : 'Masquerade'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
