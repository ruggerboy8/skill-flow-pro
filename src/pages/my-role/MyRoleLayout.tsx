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
  const currentTab = ['overview', 'practice-log', 'evaluations'].includes(lastPart) 
    ? lastPart 
    : 'overview';
  
  const handleTabChange = (value: string) => {
    if (value === 'overview') {
      navigate('/my-role');
    } else {
      navigate(`/my-role/${value}`);
    }
  };
  
  // Handle legacy routes - redirect focus and history to practice-log
  if (lastPart === 'focus' || lastPart === 'history') {
    navigate('/my-role/practice-log', { replace: true });
    return null;
  }

  // Determine role subtitle
  const roleSubtitle = staffProfile?.role_id === 1 
    ? 'DFI Competency Blueprint' 
    : 'RDA Competency Blueprint';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-2xl md:text-3xl font-bold">My Role</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-48 mt-1" />
        ) : (
          <p className="text-muted-foreground mt-1">{roleSubtitle}</p>
        )}
      </div>
      
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        {/* Floating Glass Tab Bar */}
        <div className="sticky top-0 z-10 px-4 md:px-0 py-2 -mx-4 md:mx-0">
          <TabsList className="w-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-white/40 dark:border-slate-700/40 shadow-sm rounded-full p-1">
            <TabsTrigger 
              value="overview" 
              className="flex-1 rounded-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="practice-log" 
              className="flex-1 rounded-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all"
            >
              Practice Log
            </TabsTrigger>
            <TabsTrigger 
              value="evaluations" 
              className="flex-1 rounded-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all"
            >
              Evaluations
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value={currentTab} className="mt-4 px-4 md:px-0">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
