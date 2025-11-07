import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';

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

      <div className="flex gap-4 items-start">
        {/* Left: fixed sidebar */}
        <aside className="w-[400px] shrink-0">
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto">
            <RecommenderPanel
              roleId={roleId}
              roleName={roleName}
            />
          </div>
        </aside>

        {/* Right: main column with integrated controls */}
        <main className="flex-1 min-w-0">
          <WeekBuilderPanel 
            roleId={roleId} 
            roleName={roleName}
          />
        </main>
      </div>
    </div>
  );
}
