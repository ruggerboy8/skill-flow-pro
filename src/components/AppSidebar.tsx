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
    // Special handling for admin routes - both /admin and /admin/eval-results should highlight admin
    if (href === '/admin') {
      return currentPath === '/admin' || currentPath.startsWith('/admin/');
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
        <div className="flex items-center gap-2 p-4 border-b">
          <img src="/brand/alcan-logo.svg" alt="Alcan" className="h-6" />
          {!isCollapsed && <span className="font-bold text-xl tracking-wide">ProMoves</span>}
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