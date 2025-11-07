import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface PlannerPageProps {
  roleId: number;
  roleName: string;
}

export default function PlannerPage({ roleId, roleName }: PlannerPageProps) {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pro-Move Planner - {roleName}</h1>
          <p className="text-muted-foreground">
            Analyze, recommend, and assign global pro-moves
          </p>
        </div>
        
        <Button variant="outline" onClick={() => navigate('/builder')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Builder
        </Button>
      </div>

      <ResizablePanelGroup direction="horizontal" className="gap-4" id="planner-layout">
        <ResizablePanel defaultSize={50} minSize={40} id="recommender-panel">
          <div className="h-[calc(100vh-180px)] overflow-y-auto pr-2">
            <RecommenderPanel
              roleId={roleId}
              roleName={roleName}
            />
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={50} minSize={25} id="builder-panel">
          <div className="h-full overflow-y-auto pl-2">
            <WeekBuilderPanel 
              roleId={roleId} 
              roleName={roleName}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
