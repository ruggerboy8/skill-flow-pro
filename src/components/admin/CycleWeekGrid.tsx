import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CycleWeekGridProps {
  selectedRole: number | null;
  onWeekSelect: (cycle: number, week: number) => void;
  selectedCycle: number | null;
  selectedWeek: number | null;
}

interface WeekStatus {
  cycle: number;
  week: number;
  status: 'green' | 'yellow' | 'grey';
  count: number;
}

export function CycleWeekGrid({ selectedRole, onWeekSelect, selectedCycle, selectedWeek }: CycleWeekGridProps) {
  const [cycles, setCycles] = useState<number[]>([]);
  const [weekStatuses, setWeekStatuses] = useState<Map<string, WeekStatus>>(new Map());
  const [newCycle, setNewCycle] = useState('');

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadWeekStatuses();
    }
  }, [selectedRole]);

  const loadCycles = async () => {
    const { data } = await supabase
      .from('weekly_focus')
      .select('cycle')
      .not('cycle', 'is', null);
    
    if (data) {
      const uniqueCycles = [...new Set(data.map(d => d.cycle))].sort();
      setCycles(uniqueCycles);
    }
  };

  const loadWeekStatuses = async () => {
    if (!selectedRole) return;

    const { data } = await supabase
      .from('weekly_focus')
      .select('cycle, week_in_cycle, action_id, self_select')
      .eq('role_id', selectedRole);

    const statusMap = new Map<string, WeekStatus>();
    
    // Initialize all possible week combinations
    cycles.forEach(cycle => {
      for (let week = 1; week <= 6; week++) {
        const key = `${cycle}-${week}`;
        statusMap.set(key, {
          cycle,
          week,
          status: 'grey',
          count: 0
        });
      }
    });

    // Update with actual data
    if (data) {
      data.forEach(item => {
        const key = `${item.cycle}-${item.week_in_cycle}`;
        const existing = statusMap.get(key) || { cycle: item.cycle, week: item.week_in_cycle, status: 'grey', count: 0 };
        existing.count++;
        
        if (existing.count === 3) {
          existing.status = 'green';
        } else if (existing.count > 0) {
          existing.status = 'yellow';
        }
        
        statusMap.set(key, existing);
      });
    }

    setWeekStatuses(statusMap);
  };

  const handleNewCycle = () => {
    const cycleNum = parseInt(newCycle);
    if (cycleNum && !cycles.includes(cycleNum)) {
      setCycles([...cycles, cycleNum].sort());
      setNewCycle('');
    }
  };

  const getWeekColor = (status: 'green' | 'yellow' | 'grey') => {
    switch (status) {
      case 'green': return 'bg-green-200 hover:bg-green-300 border-green-400';
      case 'yellow': return 'bg-yellow-200 hover:bg-yellow-300 border-yellow-400';
      default: return 'bg-gray-200 hover:bg-gray-300 border-gray-400';
    }
  };

  const isSelected = (cycle: number, week: number) => {
    return selectedCycle === cycle && selectedWeek === week;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cycle & Week Selection</CardTitle>
        <div className="flex gap-2">
          <Input
            placeholder="New cycle"
            value={newCycle}
            onChange={(e) => setNewCycle(e.target.value)}
            className="w-24"
          />
          <Button onClick={handleNewCycle} size="sm">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cycles.map(cycle => (
            <div key={cycle} className="space-y-2">
              <h3 className="font-semibold">Cycle {cycle}</h3>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map(week => {
                  const status = weekStatuses.get(`${cycle}-${week}`);
                  const selected = isSelected(cycle, week);
                  
                  return (
                    <Button
                      key={`${cycle}-${week}`}
                      variant="outline"
                      className={`
                        h-12 text-xs flex flex-col items-center justify-center
                        ${getWeekColor(status?.status || 'grey')}
                        ${selected ? 'ring-2 ring-blue-500' : ''}
                      `}
                      onClick={() => onWeekSelect(cycle, week)}
                      disabled={!selectedRole}
                    >
                      <span className="font-medium">W{week}</span>
                      <span className="text-xs opacity-75">
                        {status?.count || 0}/3
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}