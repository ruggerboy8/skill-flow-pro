import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
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
  const [usedActionIds, setUsedActionIds] = useState<number[]>([]);

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

      <div className="flex gap-4 items-start">
        {/* Left: fixed sidebar */}
        <aside className="w-[400px] shrink-0">
          <div className="max-h-[calc(100vh-180px)] overflow-hidden">
            <RecommenderPanel
              roleId={roleId}
              roleName={roleName}
              asOfWeek={asOfWeek}
              preset={preset}
              onWeekChange={setAsOfWeek}
              onPresetChange={setPreset}
              usedActionIds={usedActionIds}
            />
          </div>
        </aside>

        {/* Right: main column (sticky inside) */}
        <main className="flex-1 min-w-0">
          <div className="space-y-6 sticky top-4">
            <WeekBuilderPanel 
              roleId={roleId} 
              roleName={roleName}
              onUsedActionIdsChange={setUsedActionIds}
            />
            
            <HistoryPanel roleId={roleId} roleName={roleName} />
          </div>
        </main>
      </div>
    </div>
  );
}
