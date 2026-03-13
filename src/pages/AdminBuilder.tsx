import { Navigate, useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { ProMoveLibrary } from "@/components/admin/ProMoveLibrary";
import { OrgProMoveLibraryTab } from "@/components/admin/OrgProMoveLibraryTab";
import { RecommenderPanel } from "@/components/planner/RecommenderPanel";
import { WeekBuilderPanel } from "@/components/planner/WeekBuilderPanel";

export default function AdminBuilder() {
  const navigate = useNavigate();
  const { canManageAssignments, organizationId, practiceType, isSuperAdmin, isLoading } = useUserRole();

  if (isLoading) {
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Builder</h1>
        <Button variant="outline" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </div>

      <Tabs defaultValue="dfi-planner" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dfi-planner">DFI Planner</TabsTrigger>
          <TabsTrigger value="rda-planner">RDA Planner</TabsTrigger>
          <TabsTrigger value="om-planner">OM Planner</TabsTrigger>
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
        </TabsList>

        <TabsContent value="dfi-planner" className="space-y-6">
          <PlannerTabContent roleId={1} roleName="DFI" orgId={organizationId} practiceType={practiceType} />
        </TabsContent>

        <TabsContent value="rda-planner" className="space-y-6">
          <PlannerTabContent roleId={2} roleName="RDA" orgId={organizationId} practiceType={practiceType} />
        </TabsContent>

        <TabsContent value="om-planner" className="space-y-6">
          <PlannerTabContent roleId={3} roleName="Office Manager" orgId={organizationId} practiceType={practiceType} />
        </TabsContent>

        <TabsContent value="library" className="space-y-6">
          <h2 className="text-xl font-semibold">Pro-Move Library</h2>
          {isSuperAdmin ? <ProMoveLibrary /> : <OrgProMoveLibraryTab />}
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
  return (
    <div className="flex gap-4">
      {/* Left: Recommender */}
      <div className="w-1/2 shrink-0">
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
          <RecommenderPanel roleId={roleId} roleName={roleName} practiceType={practiceType} orgId={orgId} />
        </div>
      </div>

      {/* Right: Week Builder with integrated controls */}
      <div className="flex-1 min-w-0">
        <WeekBuilderPanel roleId={roleId} roleName={roleName} orgId={orgId} practiceType={practiceType} />
      </div>
    </div>
  );
}
