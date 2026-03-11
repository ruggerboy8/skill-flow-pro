import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, BookOpen, UserCog, Users, Blocks } from 'lucide-react';
import { PlatformOrgsTab } from '@/components/platform/PlatformOrgsTab';
import { PlatformUsersTab } from '@/components/platform/PlatformUsersTab';
import { ImpersonationTab } from '@/components/platform/ImpersonationTab';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { PlatformRolesTab } from '@/components/platform/PlatformRolesTab';

export default function PlatformPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin, isLoading } = useUserRole();

  const activeTab = searchParams.get('tab') || 'organizations';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // Guard: platform admins only
  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      navigate('/');
    }
  }, [isLoading, isSuperAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-56" />
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
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              This area is restricted to platform administrators only.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center space-x-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Platform Console</h1>
          <p className="text-muted-foreground">
            Manage organizations, users, pro move library, and impersonation
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[800px]">
          <TabsTrigger value="organizations" className="flex items-center space-x-2">
            <Building2 className="h-4 w-4" />
            <span>Organizations</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center space-x-2">
            <Blocks className="h-4 w-4" />
            <span>Roles</span>
          </TabsTrigger>
          <TabsTrigger value="pro-moves" className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4" />
            <span>Pro Moves</span>
          </TabsTrigger>
          <TabsTrigger value="impersonation" className="flex items-center space-x-2">
            <UserCog className="h-4 w-4" />
            <span>Impersonation</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <PlatformOrgsTab />
        </TabsContent>

        <TabsContent value="users">
          <PlatformUsersTab />
        </TabsContent>

        <TabsContent value="roles">
          <PlatformRolesTab />
        </TabsContent>

        <TabsContent value="pro-moves">
          <ProMoveLibrary />
        </TabsContent>

        <TabsContent value="impersonation">
          <ImpersonationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
