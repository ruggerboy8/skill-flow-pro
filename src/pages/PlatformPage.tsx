import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Building2, BookOpen, UserCog, Users, Blocks } from 'lucide-react';
import { PlatformOrgsTab } from '@/components/platform/PlatformOrgsTab';
import { PlatformUsersTab } from '@/components/platform/PlatformUsersTab';
import { ImpersonationTab } from '@/components/platform/ImpersonationTab';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { PlatformRolesTab } from '@/components/platform/PlatformRolesTab';
import { TabbedPageShell, type TabDefinition } from '@/components/shared/TabbedPageShell';

const TABS: TabDefinition[] = [
  { value: 'organizations', label: 'Organizations', icon: Building2, content: <PlatformOrgsTab /> },
  { value: 'users', label: 'Users', icon: Users, content: <PlatformUsersTab /> },
  { value: 'roles', label: 'Roles', icon: Blocks, content: <PlatformRolesTab /> },
  { value: 'pro-moves', label: 'Pro Moves', icon: BookOpen, content: <ProMoveLibrary /> },
  { value: 'impersonation', label: 'Impersonation', icon: UserCog, content: <ImpersonationTab /> },
];

export default function PlatformPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin, isLoading } = useUserRole();

  const activeTab = searchParams.get('tab') || 'organizations';
  const handleTabChange = (value: string) => setSearchParams({ tab: value });

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) navigate('/');
  }, [isLoading, isSuperAdmin, navigate]);

  return (
    <TabbedPageShell
      icon={Building2}
      title="Platform Console"
      description="Manage organizations, users, pro move library, and impersonation"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      isLoading={isLoading}
      hasAccess={isSuperAdmin}
      accessDeniedMessage="This area is restricted to platform administrators only."
    />
  );
}
