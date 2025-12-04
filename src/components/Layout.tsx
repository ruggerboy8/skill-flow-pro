import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useRoleRefresh } from '@/hooks/useRoleRefresh';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useSim } from '@/devtools/SimProvider';
import { useToast } from '@/hooks/use-toast';
import { Home, BarChart3, User, Settings, Users, TrendingUp, Shield } from 'lucide-react';
// Server-side backfill detection via RPC

export default function Layout() {
  const { user, signOut, isCoach: authIsCoach, isSuperAdmin: authIsSuperAdmin, isOrgAdmin: authIsOrgAdmin, isLead: authIsLead, roleLoading, refreshRoles } = useAuth();
  const { overrides } = useSim();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  
  // When masquerading, use the simulated user's roles; otherwise use auth roles
  const isMasquerading = overrides.enabled && overrides.masqueradeStaffId;
  const isCoach = isMasquerading ? (staffProfile?.is_coach || staffProfile?.is_super_admin || staffProfile?.is_org_admin || false) : authIsCoach;
  const isSuperAdmin = isMasquerading ? (staffProfile?.is_super_admin || false) : authIsSuperAdmin;
  const isOrgAdmin = isMasquerading ? (staffProfile?.is_org_admin || false) : authIsOrgAdmin;
  const isLead = isMasquerading ? (staffProfile?.is_lead || false) : authIsLead;
  const location = useLocation();
  const { toast } = useToast();

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

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    // Stats hidden for regional admins (org admins) - they use coach/admin tools
    ...(!isOrgAdmin ? [
      { name: 'Stats', href: '/stats', icon: BarChart3 },
    ] : []),
    // Backfill nav removed - keeping function for individual score backfill only
    ...(isCoach || isSuperAdmin || isOrgAdmin || isLead ? [
      { name: 'Coach', href: '/coach', icon: Users },
    ] : []),
    ...(canAccessAdmin ? [
      { name: 'Builder', href: '/builder', icon: Settings },
      { name: 'Admin', href: '/admin', icon: Shield },
      { name: 'Eval Results', href: '/admin/eval-results', icon: TrendingUp }
    ] : [])
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
            <header className="h-16 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sticky top-0 z-10">
              <SidebarTrigger />
              
              <NavLink to="/profile">
                <Button variant="outline" size="icon">
                  <User className="w-4 h-4" />
                </Button>
              </NavLink>
            </header>
            
            <main className="flex-1 p-6 overflow-auto w-full min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}