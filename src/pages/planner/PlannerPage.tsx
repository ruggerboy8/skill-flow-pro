import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { HistoryPanel } from '@/components/planner/HistoryPanel';
import { SchedulerPlaceholder } from '@/components/planner/SchedulerPlaceholder';
import { usePlannerParams } from '@/hooks/usePlannerParams';

interface PlannerPageProps {
  roleId: number;
  roleName: string;
}

export default function PlannerPage({ roleId, roleName }: PlannerPageProps) {
  const { asOfWeek, preset, setAsOfWeek, setPreset } = usePlannerParams();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pro-Move Planner</h1>
        <p className="text-muted-foreground">
          Analyze, recommend, and assign global pro-moves for {roleName}
        </p>
      </div>

      <RecommenderPanel
        roleId={roleId}
        roleName={roleName}
        asOfWeek={asOfWeek}
        preset={preset}
        onWeekChange={setAsOfWeek}
        onPresetChange={setPreset}
      />

      <HistoryPanel roleId={roleId} roleName={roleName} />

      <SchedulerPlaceholder />
    </div>
  );
}
