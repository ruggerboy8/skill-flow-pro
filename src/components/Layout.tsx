import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useRoleRefresh } from '@/hooks/useRoleRefresh';
import { useToast } from '@/hooks/use-toast';
import { Home, BarChart3, User, Settings, Users, TrendingUp, Shield } from 'lucide-react';
// Server-side backfill detection via RPC

export default function Layout() {
  const { user, signOut, isCoach, isSuperAdmin, isLead, roleLoading, refreshRoles } = useAuth();
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

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Stats', href: '/stats', icon: BarChart3 },
    // Backfill nav removed - keeping function for individual score backfill only
    ...(isCoach || isSuperAdmin || isLead ? [
      { name: 'Coach', href: '/coach', icon: Users },
    ] : []),
    ...(isCoach || isSuperAdmin ? [
      { name: 'Admin', href: '/admin', icon: Shield },
    ] : []),
    ...(isSuperAdmin ? [
      { name: 'Builder', href: '/builder', icon: Settings },
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

  // Use sidebar for coaches, super admins, and lead RDAs
  const useSidebar = isCoach || isSuperAdmin || isLead;

  if (useSidebar) {
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
                {roleLoading ? (
                  <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Outlet />
                )}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </div>
    );
  }

  // Original layout for non-coaches/non-super-admins
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <img src="/brand/alcan-logo.svg" alt="Alcan" className="h-6" />
                <span className="font-bold text-xl tracking-wide">ProMoves</span>
              </div>
              
              <div className="hidden md:flex space-x-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      className={`relative flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>

            <NavLink to="/profile">
              <Button variant="outline" size="icon">
                <User className="w-4 h-4" />
              </Button>
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div className="md:hidden border-b bg-background">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1 py-2 overflow-x-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={`relative flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-2 py-4 md:px-4 md:py-6 w-full min-w-0 overflow-auto">
        {roleLoading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}