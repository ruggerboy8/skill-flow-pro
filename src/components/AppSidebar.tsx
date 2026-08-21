import { Home, BarChart3, User, Settings, Users, ClipboardList, TrendingUp, Shield } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { ProMovesLogo } from '@/components/ProMovesLogo';
import { SignalP } from '@/components/brand/SignalP';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  navigation: Array<{
    name: string;
    href: string;
    icon: any;
  }>;
  backfillMissingCount?: number; // Made optional since backfill nav is removed
}

export function AppSidebar({ navigation, backfillMissingCount = 0 }: AppSidebarProps) {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === 'collapsed';

  const isActive = (href: string) => {
    if (href === '/') {
      return currentPath === '/';
    }
    // Eval results has its own nav item, so don't highlight admin for it
    if (href === '/admin') {
      return currentPath === '/admin' || 
        (currentPath.startsWith('/admin/') && !currentPath.startsWith('/admin/eval-results'));
    }
    // For eval-results, match exactly or sub-routes
    if (href === '/admin/eval-results-v2') {
      return currentPath.startsWith('/admin/eval-results');
    }
    return currentPath.startsWith(href);
  };

  const getNavCls = (href: string) => {
    const isItemActive = isActive(href);
    return isItemActive 
      ? "bg-primary text-primary-foreground font-medium" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";
  };

  return (
    <Sidebar
      className="border-r"
      collapsible="icon"
    >
      <SidebarContent>
        {/* DSN-8a: brand mark replaces the old text wordmark. Expanded shows
            the full lockup (Signal P + wordmark, from the promoves-brand
            kit); collapsed shows the standalone Signal P mark alone,
            centered the way other collapsed sidebar icons are. Reuses the
            sidebar's own isCollapsed state (from useSidebar()) rather than
            inventing a parallel one. */}
        <div className={cn('flex items-center p-4 border-b', isCollapsed ? 'justify-center' : 'gap-2')}>
          {isCollapsed ? (
            <SignalP size={24} label="Pro Moves" />
          ) : (
            <ProMovesLogo className="text-xl" />
          )}
        </div>
        
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon;
                const isBackfillButton = item.name === 'Backfill';
                const needsHighlight = isBackfillButton && backfillMissingCount > 0;
                
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild tooltip={item.name}>
                      <NavLink 
                        to={item.href} 
                        end 
                        className={`relative ${getNavCls(item.href)} ${needsHighlight ? 'animate-pulse' : ''}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className={isCollapsed ? 'sr-only' : ''}>{item.name}</span>
                        {needsHighlight && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-ping" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}