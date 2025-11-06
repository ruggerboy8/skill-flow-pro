import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { HistoryPanel } from '@/components/planner/HistoryPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';
import { usePlannerParams } from '@/hooks/usePlannerParams';

interface PlannerPageProps {
  roleId: number;
  roleName: string;
}

export default function PlannerPage({ roleId, roleName }: PlannerPageProps) {
  const navigate = useNavigate();
  const { asOfWeek, preset, setAsOfWeek, setPreset } = usePlannerParams();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pro-Move Planner - {roleName}</h1>
          <p className="text-muted-foreground">
            Analyze, recommend, and assign global pro-moves
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/builder')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Builder
          </Button>
        </div>
      </div>

      <RecommenderPanel
        roleId={roleId}
        roleName={roleName}
        asOfWeek={asOfWeek}
        preset={preset}
        onWeekChange={setAsOfWeek}
        onPresetChange={setPreset}
      />

      <WeekBuilderPanel roleId={roleId} roleName={roleName} />

      <HistoryPanel roleId={roleId} roleName={roleName} />
    </div>
  );
}
