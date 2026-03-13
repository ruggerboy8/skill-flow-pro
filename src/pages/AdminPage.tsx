import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Shield, Users, MapPin, Building, Settings, Building2, BookOpen, Wand2, X } from "lucide-react";
import { AdminUsersTab } from "@/components/admin/AdminUsersTab";
import { AdminLocationsTab } from "@/components/admin/AdminLocationsTab";
import { AdminOrganizationsTab } from "@/components/admin/AdminOrganizationsTab";
import { AdminGlobalSettingsTab } from "@/components/admin/AdminGlobalSettingsTab";
import { OrgProMoveLibraryTab } from "@/components/admin/OrgProMoveLibraryTab";
import { OrgSetupWizard } from "@/components/admin/setup/OrgSetupWizard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { TabbedPageShell, type TabDefinition } from "@/components/shared/TabbedPageShell";

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin, isOrgAdmin, canAccessAdmin, isLoading, organizationId } = useUserRole();

  const activeTab = searchParams.get("tab") || "users";
  const handleTabChange = (value: string) => setSearchParams({ tab: value });

  // Setup wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const checkSetupComplete = useCallback(async () => {
    if (!organizationId || isSuperAdmin) return;
    const { count } = await supabase
      .from("organization_role_names")
      .select("*", { count: "exact", head: true })
      .eq("org_id", organizationId);
    setSetupComplete((count ?? 0) > 0);
  }, [organizationId, isSuperAdmin]);

  useEffect(() => {
    if (!isLoading && organizationId) checkSetupComplete();
  }, [isLoading, organizationId, checkSetupComplete]);

  useEffect(() => {
    if (!isLoading && !canAccessAdmin) navigate("/");
  }, [isLoading, canAccessAdmin, navigate]);

  const showSetupBanner =
    !isSuperAdmin && isOrgAdmin && setupComplete === false && !bannerDismissed;

  const tabs: TabDefinition[] = useMemo(() => [
    { value: "users", label: "Users", icon: Users, content: <AdminUsersTab /> },
    { value: "locations", label: "Locations", icon: MapPin, content: <AdminLocationsTab /> },
    { value: "organizations", label: "Groups", icon: Building, content: <AdminOrganizationsTab /> },
    { value: "pro-moves", label: "Pro Moves", icon: BookOpen, content: <OrgProMoveLibraryTab /> },
    { value: "settings", label: "Settings", icon: Settings, content: <AdminGlobalSettingsTab /> },
  ], []);

  return (
    <>
      <TabbedPageShell
        icon={Shield}
        title="Administration"
        description="Manage users, locations, and group settings"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isLoading={isLoading}
        hasAccess={canAccessAdmin}
        headerActions={
          isSuperAdmin ? (
            <Button variant="outline" asChild>
              <Link to="/platform">
                <Building2 className="h-4 w-4 mr-2" />
                Platform Console
              </Link>
            </Button>
          ) : undefined
        }
        beforeTabs={
          showSetupBanner ? (
            <div className="flex items-start gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <Wand2 className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Complete your practice setup</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  Confirm your positions, locations, and submission deadlines before inviting staff.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setWizardOpen(true)}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Start Setup
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                  onClick={() => setBannerDismissed(true)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />

      {organizationId && (
        <OrgSetupWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          organizationId={organizationId}
          onComplete={() => {
            setSetupComplete(true);
            setBannerDismissed(false);
          }}
          onInviteStaff={() => setSearchParams({ tab: "users" })}
        />
      )}
    </>
  );
}
