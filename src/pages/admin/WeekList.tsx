import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Role {
  role_id: number;
  role_name: string;
}

export default function WeekList() {
  const { roleId, cycle } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [lockedWeeks, setLockedWeeks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (roleId && cycle) {
      loadRole();
      loadLockedWeeks();
    }
  }, [roleId, cycle]);

  const loadRole = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .eq('role_id', parseInt(roleId!))
      .single();
    
    if (data) setRole(data);
  };

  const loadLockedWeeks = async () => {
    const { data } = await supabase
      .from('weekly_scores')
      .select('weekly_focus!inner(week_in_cycle)')
      .eq('weekly_focus.cycle', parseInt(cycle!))
      .eq('weekly_focus.role_id', parseInt(roleId!));

    if (data) {
      const locked = new Set(data.map(item => (item.weekly_focus as any).week_in_cycle));
      setLockedWeeks(locked);
    }
  };

  const weeks = [1, 2, 3, 4, 5, 6];

  return (
    <div className="container mx-auto p-6">
      <div className="sticky top-0 bg-background border-b mb-6 pb-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/builder/${roleId}`)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cycles
          </Button>
          <h1 className="text-3xl font-bold">{role?.role_name} · Cycle {cycle}</h1>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Select Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {weeks.map(week => {
              const isLocked = lockedWeeks.has(week);
              
              return (
                <div
                  key={week}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Week {week}</span>
                    {isLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  
                  <Button
                    variant={isLocked ? "secondary" : "default"}
                    onClick={() => navigate(`/builder/${roleId}/${cycle}/week/${week}`)}
                  >
                    {isLocked ? "View" : "Edit"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}