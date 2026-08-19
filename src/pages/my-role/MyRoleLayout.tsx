import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Skeleton } from '@/components/ui/skeleton';
import { useMobileShell } from '@/hooks/useMobileShell';
import { BackPill } from '@/components/mobile/BackPill';

export default function MyRoleLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileShell = useMobileShell();
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

  // Determine role subtitle from archetype (multi-org safe).
  const archetype = (staffProfile as any)?.roles?.archetype_code as string | null | undefined;
  const roleLabel = (staffProfile as any)?.roles?.role_name as string | null | undefined;
  const roleSubtitle =
    staffProfile?.is_lead && archetype === 'dental_assistant'
      ? 'Lead Dental Assistant Competency Blueprint'
      : roleLabel
        ? `${roleLabel} Competency Blueprint`
        : 'Competency Blueprint';

  // Mobile shell overview = the Craft Atlas (rendered by RoleRadar's own
  // mobile branch). It owns its full screen, including its own eyebrow +
  // h1 "My Role" header per the atlas visual spec, so this layout skips
  // its generic header/tab chrome entirely here rather than doubling up
  // on "My Role". Non-overview mobile routes (practice-log, evaluations)
  // and all of desktop are unaffected. See
  // docs/features/explore-my-role-build-instructions.md section B.
  const isAtlasOverview = isMobileShell && currentTab === 'overview';

  if (isAtlasOverview) {
    return <Outlet />;
  }

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
        {isMobileShell ? (
          // Mobile shell: My Role is overview-only (no internal tab strip);
          // practice-log/evaluations still route here but moved to the
          // Performance tab conceptually, so show a BackPill to it instead.
          // See docs/features/mobile-adjustments-round3.md item 2.
          currentTab !== 'overview' && (
            <div className="px-4 md:px-0 pt-2">
              <BackPill label="Performance" to="/performance" />
            </div>
          )
        ) : (
          /* Floating Glass Tab Bar (desktop only) */
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
        )}

        <TabsContent value={currentTab} className="mt-4 px-4 md:px-0">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
