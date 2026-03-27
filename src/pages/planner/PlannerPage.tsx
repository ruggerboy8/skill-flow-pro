import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';
import { useUserRole } from '@/hooks/useUserRole';

interface PlannerPageProps {
  roleId: number;
  roleName: string;
}

export default function PlannerPage({ roleId, roleName }: PlannerPageProps) {
  const navigate = useNavigate();
  const { practiceType } = useUserRole();
  const [showRecommender, setShowRecommender] = useState(false);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pro-Move Planner - {roleName}</h1>
          <p className="text-muted-foreground">
            Analyze, recommend, and assign global pro-moves
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRecommender(v => !v)}>
            <BarChart2 className="h-4 w-4 mr-2" />
            {showRecommender ? 'Hide Recommender' : 'Recommender'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/builder')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Builder
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {showRecommender && (
          <div className="w-[380px] flex-none h-[calc(100vh-180px)] overflow-y-auto">
            <RecommenderPanel
              roleId={roleId}
              roleName={roleName}
              practiceType={practiceType}
            />
          </div>
        )}
        <div className="flex-1 min-w-0 h-[calc(100vh-180px)] overflow-y-auto">
          <WeekBuilderPanel
            roleId={roleId}
            roleName={roleName}
            practiceType={practiceType}
          />
        </div>
      </div>
    </div>
  );
}
