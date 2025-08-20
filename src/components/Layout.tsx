import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBackfillStatus } from '@/hooks/useBackfillStatus';
import { Home, BarChart3, User, Settings, Users, ClipboardList, Building, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_EMAILS = ['johno@reallygoodconsulting.org'];

export default function Layout() {
  const { user, signOut, isCoach } = useAuth();
  const { isBackfillComplete } = useBackfillStatus();
  const location = useLocation();
  
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsSuperAdmin(false); return; }
    supabase
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsSuperAdmin(!!data?.is_super_admin));
  }, [user]);
  
  const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');
  
  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Stats', href: '/stats', icon: BarChart3 },
    // Show backfill button for all users when not complete
    ...(isBackfillComplete === false ? [{ name: 'Backfill', href: '/backfill', icon: ClipboardList }] : []),
    ...(isCoach ? [{ name: 'Coach', href: '/coach', icon: Users }] : []),
    ...(isSuperAdmin ? [
      { name: 'Builder', href: '/builder', icon: Settings },
      { name: 'Organizations', href: '/admin/organizations', icon: Building },
      { name: 'Locations', href: '/admin/locations', icon: MapPin }
    ] : [])
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <img src="/brand/alcan-logo.svg" alt="Alcan" className="h-6" />
                <span className="font-bold text-xl tracking-wide">SkillCheck</span>
              </div>
              
              <div className="hidden md:flex space-x-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isBackfillButton = item.name === 'Backfill';
                  const needsHighlight = isBackfillButton && isBackfillComplete === false;
                  
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
              const needsHighlight = isBackfillButton && isBackfillComplete === false;
              
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