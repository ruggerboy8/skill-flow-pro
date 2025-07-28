import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Role {
  role_id: number;
  role_name: string;
}

export default function CycleList() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [cycles, setCycles] = useState<number[]>([]);

  useEffect(() => {
    if (roleId) {
      loadRole();
      loadCycles();
    }
  }, [roleId]);

  const loadRole = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .eq('role_id', parseInt(roleId!))
      .single();
    
    if (data) setRole(data);
  };

  const loadCycles = async () => {
    const { data } = await supabase
      .from('weekly_focus')
      .select('cycle')
      .eq('role_id', parseInt(roleId!))
      .not('cycle', 'is', null);
    
    if (data) {
      const uniqueCycles = [...new Set(data.map(d => d.cycle))].sort();
      setCycles(uniqueCycles);
    }
  };

  const addCycle = () => {
    const nextCycle = cycles.length > 0 ? Math.max(...cycles) + 1 : 1;
    navigate(`/builder/${roleId}/${nextCycle}`);
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{role?.role_name} Cycles</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Select Cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cycles.map(cycle => (
              <div
                key={cycle}
                className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted"
                onClick={() => navigate(`/builder/${roleId}/${cycle}`)}
              >
                <span className="font-medium">Cycle {cycle}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            ))}
            
            <Button 
              onClick={addCycle}
              variant="outline" 
              className="w-full mt-4"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Cycle
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}