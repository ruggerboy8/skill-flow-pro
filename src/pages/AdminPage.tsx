import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, MapPin, Building, Settings, Building2, BookOpen, Wand2, X } from "lucide-react";
import { AdminUsersTab } from "@/components/admin/AdminUsersTab";
import { AdminLocationsTab } from "@/components/admin/AdminLocationsTab";
import { AdminOrganizationsTab } from "@/components/admin/AdminOrganizationsTab";
import { AdminGlobalSettingsTab } from "@/components/admin/AdminGlobalSettingsTab";
import { OrgProMoveLibraryTab } from "@/components/admin/OrgProMoveLibraryTab";
import { OrgSetupWizard } from "@/components/admin/setup/OrgSetupWizard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin, isOrgAdmin, canAccessAdmin, isLoading, organizationId } = useUserRole();

  const activeTab = searchParams.get("tab") || "users";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // Setup wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const checkSetupComplete = useCallback(async () => {
    if (!organizationId || isSuperAdmin) return;
    const { count } = await supabase
      .from("organization_role_names")
      .select("*", { count: "exact", head: true })
      .eq("org_id", organizationId);
    setSetupComplete((count ?? 0) > 0);
  }, [organizationId, isSuperAdmin]);

  useEffect(() => {
    if (!isLoading && organizationId) {
      checkSetupComplete();
    }
  }, [isLoading, organizationId, checkSetupComplete]);

  // Guard: org admins and platform admins only
  useEffect(() => {
    if (!isLoading && !canAccessAdmin) {
      navigate("/");
    }
  }, [isLoading, canAccessAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              This area is restricted to administrators only.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show setup banner for org admins (not super admins) who haven't completed setup
  const showSetupBanner =
    !isSuperAdmin &&
    isOrgAdmin &&
    setupComplete === false &&
    !bannerDismissed;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Administration</h1>
            <p className="text-muted-foreground">
              Manage users, locations, and group settings
            </p>
          </div>
        </div>

        {/* Platform Console shortcut — platform admins only */}
        {isSuperAdmin && (
          <Button variant="outline" asChild>
            <Link to="/platform">
              <Building2 className="h-4 w-4 mr-2" />
              Platform Console
            </Link>
          </Button>
        )}
      </div>

      {/* Setup checklist banner — shown to org admins who haven't completed setup */}
      {showSetupBanner && (
        <div className="flex items-start gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <Wand2 className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Complete your practice setup</p>
            <p className="text-sm text-amber-800 mt-0.5">
              Confirm your positions, locations, and submission deadlines before inviting staff.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => setWizardOpen(true)}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Start Setup
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[640px]">
          <TabsTrigger value="users" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center space-x-2">
            <MapPin className="h-4 w-4" />
            <span>Locations</span>
          </TabsTrigger>
          <TabsTrigger value="organizations" className="flex items-center space-x-2">
            <Building className="h-4 w-4" />
            <span>Groups</span>
          </TabsTrigger>
          <TabsTrigger value="pro-moves" className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4" />
            <span>Pro Moves</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminUsersTab />
        </TabsContent>

        <TabsContent value="locations">
          <AdminLocationsTab />
        </TabsContent>

        <TabsContent value="organizations">
          <AdminOrganizationsTab />
        </TabsContent>

        <TabsContent value="pro-moves">
          <OrgProMoveLibraryTab />
        </TabsContent>

        <TabsContent value="settings">
          <AdminGlobalSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Org setup wizard — only mounted when organizationId is available */}
      {organizationId && (
        <OrgSetupWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          organizationId={organizationId}
          onComplete={() => {
            setSetupComplete(true);
            setBannerDismissed(false); // banner will auto-hide since setupComplete = true
          }}
          onInviteStaff={() => setSearchParams({ tab: "users" })}
        />
      )}
    </div>
  );
}
