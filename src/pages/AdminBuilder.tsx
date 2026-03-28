import { useState, useEffect, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BarChart2 } from "lucide-react";
import { OrgProMoveLibraryTab } from "@/components/admin/OrgProMoveLibraryTab";
import { RecommenderPanel } from "@/components/planner/RecommenderPanel";
import { WeekBuilderPanel } from "@/components/planner/WeekBuilderPanel";
import { WeekSignalSummary } from "@/components/planner/WeekSignalSummary";
import { supabase } from "@/integrations/supabase/client";
import { ARCHETYPES, type ArchetypeCode } from "@/lib/roleArchetypes";
import { adaptSequencerResponse, type RankedMove } from "@/lib/sequencerAdapter";

interface PlannerRole {
  role_id: number;
  display_name: string;
  archetype_code: string;
}

// Tailwind grid-cols classes for known tab counts (planner roles + library)
const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-2',
  2: 'grid-cols-3',
  3: 'grid-cols-4',
  4: 'grid-cols-5',
  5: 'grid-cols-6',
};

export default function AdminBuilder() {
  const navigate = useNavigate();
  const { canManageAssignments, organizationId, practiceType, isLoading, isSuperAdmin } = useUserRole();
  const [plannerRoles, setPlannerRoles] = useState<PlannerRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    loadPlannerRoles();
  }, [organizationId, practiceType, isLoading]);

  async function loadPlannerRoles() {
    setRolesLoading(true);

    if (organizationId) {
      // Load org's configured roles with archetype_code via join
      const { data } = await supabase
        .from('organization_role_names')
        .select('role_id, display_name, roles!inner(archetype_code)')
        .eq('org_id', organizationId);

      const filtered = (data ?? [])
        .filter(r => ARCHETYPES[(r.roles as any).archetype_code as ArchetypeCode]?.hasPlannerTab)
        .map(r => ({
          role_id: r.role_id,
          display_name: r.display_name,
          archetype_code: (r.roles as any).archetype_code as string,
        }));

      setPlannerRoles(filtered);
    } else {
      // Super admin without org context: load from global roles filtered by practice type
      const query = supabase
        .from('roles')
        .select('role_id, role_name, archetype_code')
        .eq('active', true)
        .not('archetype_code', 'is', null);

      if (practiceType) {
        query.eq('practice_type', practiceType);
      }

      const { data } = await query;

      const filtered = (data ?? [])
        .filter(r => r.archetype_code && ARCHETYPES[r.archetype_code as ArchetypeCode]?.hasPlannerTab)
        .map(r => ({
          role_id: r.role_id,
          display_name: r.role_name,
          archetype_code: r.archetype_code as string,
        }));

      setPlannerRoles(filtered);
    }

    setRolesLoading(false);
  }

  if (isLoading || rolesLoading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!canManageAssignments) {
    return <Navigate to="/" replace />;
  }

  const totalTabs = plannerRoles.length + 1; // +1 for Library
  const gridClass = GRID_COLS[totalTabs] ?? 'grid-cols-4';
  const defaultTab = plannerRoles.length > 0 ? `role-${plannerRoles[0].role_id}` : 'library';

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Builder</h1>
        <Button variant="outline" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={`grid w-full ${gridClass}`}>
          {plannerRoles.map(r => (
            <TabsTrigger key={r.role_id} value={`role-${r.role_id}`}>
              {r.display_name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
        </TabsList>

        {plannerRoles.map(r => (
          <TabsContent key={r.role_id} value={`role-${r.role_id}`} className="space-y-6">
            <PlannerTabContent
              roleId={r.role_id}
              roleName={r.display_name}
              orgId={organizationId}
              practiceType={practiceType}
            />
          </TabsContent>
        ))}

        <TabsContent value="library" className="space-y-6">
          <h2 className="text-xl font-semibold">Pro-Move Library</h2>
          <OrgProMoveLibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlannerTabContent({
  roleId,
  roleName,
  orgId,
  practiceType,
}: {
  roleId: number;
  roleName: string;
  orgId?: string;
  practiceType?: string;
}) {
  const [rankedMoves, setRankedMoves] = useState<RankedMove[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [showSignalView, setShowSignalView] = useState(false);

  const loadRankedMoves = useCallback(async () => {
    setRankLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
          orgId,
          preset: 'balanced',
          lookbackWeeks: 9,
          practiceType,
          constraints: { cooldownWeeks: 4, minDistinctDomains: 2 },
        },
      });
      if (error) throw error;
      const adapted = adaptSequencerResponse(data);
      setRankedMoves(adapted);
    } catch {
      setRankedMoves([]);
    } finally {
      setRankLoading(false);
    }
  }, [roleId, orgId, practiceType]);

  useEffect(() => {
    loadRankedMoves();
  }, [loadRankedMoves]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowSignalView(v => !v)}>
          <BarChart2 className="h-4 w-4 mr-1.5" />
          {showSignalView ? 'Hide Signal View' : 'Signal View'}
        </Button>
      </div>
      <WeekSignalSummary rankedMoves={rankedMoves} loading={rankLoading} roleName={roleName} />
      <div className="flex gap-4">
        {showSignalView && (
          <div className="w-[360px] flex-none max-h-[calc(100vh-280px)] overflow-y-auto">
            <RecommenderPanel
              roleId={roleId}
              roleName={roleName}
              practiceType={practiceType}
              orgId={orgId}
              rankedMovesOverride={rankedMoves}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <WeekBuilderPanel
            roleId={roleId}
            roleName={roleName}
            orgId={orgId}
            practiceType={practiceType}
            rankedMoves={rankedMoves}
          />
        </div>
      </div>
    </div>
  );
}
