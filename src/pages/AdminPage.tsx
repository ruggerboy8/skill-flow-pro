import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, MapPin, Building, Settings, Building2 } from "lucide-react";
import { AdminUsersTab } from "@/components/admin/AdminUsersTab";
import { AdminLocationsTab } from "@/components/admin/AdminLocationsTab";
import { AdminOrganizationsTab } from "@/components/admin/AdminOrganizationsTab";
import { AdminGlobalSettingsTab } from "@/components/admin/AdminGlobalSettingsTab";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin, isOrgAdmin, canAccessAdmin, isLoading } = useUserRole();

  const activeTab = searchParams.get("tab") || "users";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

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

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
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

        <TabsContent value="settings">
          <AdminGlobalSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
