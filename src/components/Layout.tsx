import { useState } from 'react';
import alcanLogo from '@/assets/alcan-logo.png';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useRoleRefresh } from '@/hooks/useRoleRefresh';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useRoutePersistence } from '@/hooks/useRoutePersistence';
import { useSim } from '@/devtools/SimProvider';
import { useToast } from '@/hooks/use-toast';
import { SimConsole } from '@/devtools/SimConsole';
import { Home, User, Settings as SettingsIcon, Users, TrendingUp, Shield, BookOpen, Building2, Globe, Stethoscope, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
// Server-side backfill detection via RPC

export default function Layout() {
  const { user, signOut, isCoach: authIsCoach, isSuperAdmin: authIsSuperAdmin, isOrgAdmin: authIsOrgAdmin, isLead: authIsLead, roleLoading, refreshRoles } = useAuth();
  const { overrides } = useSim();
  const [isSimConsoleOpen, setIsSimConsoleOpen] = useState(false);
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  
  // When masquerading, use the simulated user's roles; otherwise use auth roles
  const isMasquerading = overrides.enabled && overrides.masqueradeStaffId;
  const isCoach = isMasquerading ? (staffProfile?.is_coach || staffProfile?.is_super_admin || staffProfile?.is_org_admin || false) : authIsCoach;
  const isSuperAdmin = isMasquerading ? (staffProfile?.is_super_admin || false) : authIsSuperAdmin;
  const isOrgAdmin = isMasquerading ? (staffProfile?.is_org_admin || false) : authIsOrgAdmin;
  const isLead = isMasquerading ? (staffProfile?.is_lead || false) : authIsLead;
  const isOfficeManager = isMasquerading ? (staffProfile?.is_office_manager || false) : (staffProfile?.is_office_manager || false);
  const isDoctor = staffProfile?.is_doctor || false;
  const isClinicalDirector = staffProfile?.is_clinical_director || false;
  const location = useLocation();
  const { toast } = useToast();
  
  // Persist and restore route on page refresh
  useRoutePersistence();

  // Monitor for role changes and refresh automatically
  useRoleRefresh(user?.id || null, {
    enabled: !!user,
    pollInterval: 60000, // Check every 60 seconds
    onRoleChange: async () => {
      await refreshRoles();
      toast({
        title: "Permissions Updated",
        description: "Your role or permissions have been updated.",
      });
    }
  });

  // Can access admin = super admin OR org admin
  const canAccessAdmin = isSuperAdmin || isOrgAdmin;

  // Can access builder = admins, OR staff with explicit can_manage_assignments capability
  const canManageAssignments =
    canAccessAdmin ||
    ((staffProfile?.user_capabilities as any)?.can_manage_assignments ?? false);
  
  // Office managers who are NOT coaches should see "My Location" link
  const showLocationDashboard = isOfficeManager && !isCoach && !isOrgAdmin;

  // Determine navigation based on user type
  const navigation = isDoctor ? [
    // Doctor-specific navigation
    { name: 'Home', href: '/doctor', icon: Home },
    { name: 'My Role', href: '/doctor/my-role', icon: BookOpen },
    { name: 'My Team', href: '/doctor/my-team', icon: Users },
    { name: 'Coaching History', href: '/doctor/coaching-history', icon: ClipboardList },
  ] : isSuperAdmin ? [
    // Super admin navigation — Command Center first, no Home/My Role
    { name: 'Command Center', href: '/dashboard', icon: Building2 },
    { name: 'Coach', href: '/coach', icon: Users },
    { name: 'Clinical', href: '/clinical', icon: Stethoscope },
    { name: 'Builder', href: '/builder', icon: SettingsIcon },
    { name: 'Evaluations', href: '/admin/evaluations', icon: TrendingUp },
    { name: 'Admin', href: '/admin', icon: Shield },
    { name: 'Platform', href: '/platform', icon: Globe },
  ] : [
    // Standard navigation
    // Org admins see Command Center instead of Home
    ...(isOrgAdmin ? [
      { name: 'Command Center', href: '/dashboard', icon: Building2 },
    ] : [
      { name: 'Home', href: '/', icon: Home },
    ]),
    // My Role hidden for regional admins (org admins) - they use coach/admin tools
    ...(!isOrgAdmin ? [
      { name: 'My Role', href: '/my-role', icon: BookOpen },
    ] : []),
    // My Location for Office Managers (view-only access to their location)
    ...(showLocationDashboard ? [
      { name: 'My Location', href: '/my-location', icon: Building2 },
    ] : []),
    // Clinical Director portal
    ...(isClinicalDirector ? [
      { name: 'Clinical', href: '/clinical', icon: Stethoscope },
    ] : []),
    // Backfill nav removed - keeping function for individual score backfill only
    ...(isCoach || isOrgAdmin || isLead ? [
      { name: 'Coach', href: '/coach', icon: Users },
    ] : []),
    ...(canManageAssignments ? [
      { name: 'Builder', href: '/builder', icon: SettingsIcon },
    ] : []),
    ...(canAccessAdmin ? [
      { name: 'Admin', href: '/admin', icon: Shield },
      { name: 'Evaluations', href: '/admin/evaluations', icon: TrendingUp }
    ] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    // Special handling for admin routes - both /admin and /admin/eval-results should highlight admin
    if (href === '/admin') {
      return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
    }
    return location.pathname.startsWith(href);
  };

  // Show loading state until roles are loaded
  if (roleLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="w-64 border-r p-4 space-y-4 hidden md:block">
          <Skeleton className="h-8 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // All users now use sidebar navigation
  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar navigation={navigation} />
          
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-16 flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sticky top-0 z-10">
              <SidebarTrigger />
              
              {/* Centered logo */}
              <div className="absolute left-1/2 -translate-x-1/2">
                <img src={alcanLogo} alt="Pro-Moves" className="h-6 dark:invert" />
              </div>
              
              <div className="flex-1" />
              
              <div className="flex items-center gap-2">
                {/* Sim console trigger - only for admins with dev tools enabled */}
                {(user?.email === 'johno@reallygoodconsulting.org' || user?.email === 'ryanjoberly@gmail.com') && 
                 import.meta.env.VITE_ENABLE_SIMTOOLS === 'true' && (
                  <Button variant="ghost" size="icon" onClick={() => setIsSimConsoleOpen(true)}>
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                )}
                
                <NavLink to="/profile">
                  <Button variant="outline" size="icon">
                    <User className="w-4 h-4" />
                  </Button>
                </NavLink>
              </div>
            </header>
            
            <SimConsole isOpen={isSimConsoleOpen} onClose={() => setIsSimConsoleOpen(false)} />
            
            <main className="flex-1 p-6 overflow-auto w-full min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}