import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { Home, BarChart3, User, Settings, Users, ClipboardList, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isV2 } from '@/lib/featureFlags';
// Server-side backfill detection via RPC

export default function Layout() {
  const { user, signOut, isCoach } = useAuth();
  const location = useLocation();
  
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [backfillMissingCount, setBackfillMissingCount] = useState(0);
  const [isLoadingBackfill, setIsLoadingBackfill] = useState(true);

  useEffect(() => {
    if (!user) { 
      setIsSuperAdmin(false);
      setBackfillMissingCount(0);
      setIsLoadingBackfill(false);
      return; 
    }

    async function loadStaffData() {
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, role_id, is_super_admin')
          .eq('user_id', user.id)
          .maybeSingle();

        if (staffData) {
          setIsSuperAdmin(!!staffData.is_super_admin);
          
          // Always check backfill status for all users with valid staff data
          if (staffData.id && staffData.role_id) {
            console.log('Checking backfill status for staff:', staffData.id, 'role:', staffData.role_id);
            const { data: backfillResult, error } = await supabase.rpc('needs_backfill', {
              p_staff_id: staffData.id,
              p_role_id: staffData.role_id
            });
            
            console.log('Backfill RPC result:', backfillResult, 'error:', error);
            
            if (!error && backfillResult && typeof backfillResult === 'object') {
              const missingCount = (backfillResult as any).missingCount || 0;
              console.log('Setting backfill missing count to:', missingCount);
              setBackfillMissingCount(missingCount);
            } else if (error) {
              console.error('Error checking backfill status:', error);
              // For new users, assume they need backfill if there's an error
              setBackfillMissingCount(6);
            }
          }
        }
      } catch (error) {
        console.error('Error loading staff data:', error);
      } finally {
        setIsLoadingBackfill(false);
      }
    }

    loadStaffData();
  }, [user, location.pathname]); // Re-check when user navigates
  
  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Stats', href: '/stats', icon: BarChart3 },
    // Show backfill button when server indicates missing completion data
    ...(isV2 && !isLoadingBackfill && backfillMissingCount > 0 ? [{ name: 'Backfill', href: '/backfill', icon: ClipboardList }] : []),
    ...(isCoach ? [{ name: 'Coach', href: '/coach', icon: Users }] : []),
    ...(isSuperAdmin ? [
      { name: 'Builder', href: '/builder', icon: Settings },
      { name: 'Admin', href: '/admin', icon: Settings },
      { name: 'Eval Results', href: '/admin/eval-results', icon: TrendingUp }
    ] : [])
  ];

  console.log('Layout - backfillMissingCount:', backfillMissingCount, 'isV2:', isV2, 'navigation length:', navigation.length);

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  // Use sidebar for coaches and super admins
  const useSidebar = isCoach || isSuperAdmin;

  if (useSidebar) {
    return (
      <div className="min-h-screen bg-background">
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar navigation={navigation} backfillMissingCount={backfillMissingCount} />
            
            <div className="flex-1 flex flex-col">
              <header className="h-16 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
                <SidebarTrigger />
                
                <NavLink to="/profile">
                  <Button variant="outline" size="icon">
                    <User className="w-4 h-4" />
                  </Button>
                </NavLink>
              </header>
              
              <main className="flex-1 p-6">
                <Outlet />
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
                  const isBackfillButton = item.name === 'Backfill';
                  const needsHighlight = isBackfillButton && backfillMissingCount > 0;
                  
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      className={`relative flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      } ${needsHighlight ? 'animate-pulse' : ''}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                      {needsHighlight && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-ping" />
                      )}
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
              const isBackfillButton = item.name === 'Backfill';
              const needsHighlight = isBackfillButton && backfillMissingCount > 0;
              
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={`relative flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  } ${needsHighlight ? 'animate-pulse' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  {needsHighlight && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-ping" />
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}