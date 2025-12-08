import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Skeleton } from '@/components/ui/skeleton';

export default function MyRoleLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: staffProfile, isLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });
  
  // Extract the tab from the pathname
  const pathParts = location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1];
  const currentTab = ['overview', 'focus', 'history', 'evaluations'].includes(lastPart) 
    ? lastPart 
    : 'overview';
  
  const handleTabChange = (value: string) => {
    if (value === 'overview') {
      navigate('/my-role');
    } else {
      navigate(`/my-role/${value}`);
    }
  };

  // Determine role subtitle
  const roleSubtitle = staffProfile?.role_id === 1 
    ? 'DFI Competency Blueprint' 
    : 'RDA Competency Blueprint';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Role</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-48 mt-1" />
        ) : (
          <p className="text-muted-foreground mt-1">{roleSubtitle}</p>
        )}
      </div>
      
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="focus">Focus</TabsTrigger>
          <TabsTrigger value="history">Practice Log</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
        </TabsList>
        
        <TabsContent value={currentTab} className="mt-6">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
