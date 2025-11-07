import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';
import { MonthView } from '@/components/planner/MonthView';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { normalizeToPlannerWeek, formatWeekOf } from '@/lib/plannerUtils';

interface PlannerPageProps {
  roleId: number;
  roleName: string;
}

export default function PlannerPage({ roleId, roleName }: PlannerPageProps) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [showTwoWeeks, setShowTwoWeeks] = useState(false);
  const [selectedMonday, setSelectedMonday] = useState(normalizeToPlannerWeek(new Date()));

  const getPrevMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  };

  const getNextMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pro-Move Planner - {roleName}</h1>
          <p className="text-muted-foreground">
            Analyze, recommend, and assign global pro-moves
          </p>
        </div>
        
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate('/builder')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Builder
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'month')}>
          <TabsList>
            <TabsTrigger value="week">Week View</TabsTrigger>
            <TabsTrigger value="month">Month View</TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === 'week' && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedMonday(getPrevMonday(selectedMonday))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              Week of {formatWeekOf(selectedMonday)}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedMonday(getNextMonday(selectedMonday))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Checkbox 
                id="twoWeeks" 
                checked={showTwoWeeks} 
                onCheckedChange={(checked) => setShowTwoWeeks(checked as boolean)} 
              />
              <Label htmlFor="twoWeeks" className="text-sm">Show 2 weeks</Label>
            </div>
          </>
        )}
      </div>
    </div>

    <div className="flex gap-4 items-start">
      {/* Left: fixed sidebar */}
      <aside className="w-[400px] shrink-0">
        <div className="max-h-[calc(100vh-180px)] overflow-hidden">
          <RecommenderPanel
            roleId={roleId}
            roleName={roleName}
          />
        </div>
      </aside>

      {/* Right: main column */}
      <main className="flex-1 min-w-0">
        {viewMode === 'week' ? (
          <WeekBuilderPanel 
            roleId={roleId} 
            roleName={roleName}
            selectedMonday={selectedMonday}
            showTwoWeeks={showTwoWeeks}
            onChangeSelectedMonday={setSelectedMonday}
          />
        ) : (
          <MonthView
            roleId={roleId}
            selectedMonthAnchor={selectedMonday}
            onSelectWeek={(monday) => {
              setSelectedMonday(monday);
              setViewMode('week');
            }}
          />
        )}
      </main>
    </div>
    </div>
  );
}
