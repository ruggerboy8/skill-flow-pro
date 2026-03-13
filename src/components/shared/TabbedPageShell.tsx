import { type LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export interface TabDefinition {
  value: string;
  label: string;
  icon: LucideIcon;
  content: React.ReactNode;
}

interface TabbedPageShellProps {
  /** Page title icon */
  icon: LucideIcon;
  /** Shown when access is denied */
  deniedIcon?: LucideIcon;
  title: string;
  description: string;
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (value: string) => void;
  isLoading?: boolean;
  hasAccess?: boolean;
  accessDeniedMessage?: string;
  /** Optional content rendered in the header area (e.g. buttons) */
  headerActions?: React.ReactNode;
  /** Optional content rendered between header and tabs (e.g. banners) */
  beforeTabs?: React.ReactNode;
}

/**
 * Shared shell for tabbed admin/platform pages.
 * Handles loading skeleton, access denied, and tab layout.
 */
export function TabbedPageShell({
  icon: Icon,
  deniedIcon: DeniedIcon,
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  isLoading,
  hasAccess = true,
  accessDeniedMessage = 'This area is restricted to administrators only.',
  headerActions,
  beforeTabs,
}: TabbedPageShellProps) {
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    const AccessIcon = DeniedIcon ?? Icon;
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <AccessIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>{accessDeniedMessage}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Compute grid cols based on tab count
  const colsClass =
    tabs.length <= 3
      ? `grid-cols-${tabs.length}`
      : tabs.length === 4
        ? 'grid-cols-4'
        : 'grid-cols-5';

  // Compute max width
  const maxW = tabs.length <= 3 ? 'lg:w-[480px]' : tabs.length === 4 ? 'lg:w-[640px]' : 'lg:w-[800px]';

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
        {headerActions}
      </div>

      {beforeTabs}

      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
        <TabsList className={`grid w-full ${colsClass} ${maxW}`}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center space-x-2">
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
