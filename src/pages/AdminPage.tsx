import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, MapPin, Building, Settings } from "lucide-react";
import { AdminUsersTab } from "@/components/admin/AdminUsersTab";
import { AdminLocationsTab } from "@/components/admin/AdminLocationsTab";
import { AdminOrganizationsTab } from "@/components/admin/AdminOrganizationsTab";
import { AdminGlobalSettingsTab } from "@/components/admin/AdminGlobalSettingsTab";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const activeTab = searchParams.get("tab") || "users";

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        navigate("/");
        return;
      }

      try {
        const { data: staffData, error } = await supabase
          .from("staff")
          .select("is_super_admin, is_org_admin")
          .eq("user_id", user.id)
          .single();

        // Allow access if user is super admin OR org admin
        if (error || (!staffData?.is_super_admin && !staffData?.is_org_admin)) {
          navigate("/");
          return;
        }

        setIsSuperAdmin(true);
      } catch (error) {
        console.error("Error checking admin status:", error);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, navigate]);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  if (loading) {
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

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              This area is restricted to super administrators only.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center space-x-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="text-muted-foreground">
            Manage users, locations, and organizational settings
          </p>
        </div>
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
            <span>Organizations</span>
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