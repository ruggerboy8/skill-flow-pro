import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface Role {
  role_id: number;
  role_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
}

interface ProMove {
  action_id: number;
  action_statement: string;
}

interface WeekListItem {
  action_id: number;
  action_statement: string;
  display_order: number;
}

const ADMIN_EMAILS = ['johno@reallygoodconsulting.org'];

export default function AdminBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Access control
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
    return <Navigate to="/" replace />;
  }

  const [cycles, setCycles] = useState<number[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [newCycle, setNewCycle] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [selectedCompetency, setSelectedCompetency] = useState<number | null>(null);
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [selectedProMove, setSelectedProMove] = useState<number | null>(null);
  const [weekList, setWeekList] = useState<WeekListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Load initial data
  useEffect(() => {
    loadCycles();
    loadRoles();
  }, []);

  // Load competencies when role changes
  useEffect(() => {
    if (selectedRole) {
      loadCompetencies(selectedRole);
    } else {
      setCompetencies([]);
      setSelectedCompetency(null);
    }
  }, [selectedRole]);

  // Load pro moves when competency changes
  useEffect(() => {
    if (selectedCompetency) {
      loadProMoves(selectedCompetency);
    } else {
      setProMoves([]);
      setSelectedProMove(null);
    }
  }, [selectedCompetency]);

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

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  const loadCompetencies = async (roleId: number) => {
    const { data } = await supabase
      .from('competencies')
      .select('competency_id, name')
      .eq('role_id', roleId)
      .order('name');
    
    if (data) setCompetencies(data);
  };

  const loadProMoves = async (competencyId: number) => {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement')
      .eq('competency_id', competencyId)
      .eq('status', 'Active')
      .order('action_statement');
    
    if (data) setProMoves(data);
  };

  const handleNewCycle = () => {
    const cycleNum = parseInt(newCycle);
    if (cycleNum && !cycles.includes(cycleNum)) {
      setCycles([...cycles, cycleNum].sort());
      setSelectedCycle(cycleNum);
      setNewCycle('');
    }
  };

  const addToWeekList = () => {
    if (!selectedProMove) return;
    
    const proMove = proMoves.find(pm => pm.action_id === selectedProMove);
    if (!proMove) return;

    // Check for duplicates
    if (weekList.some(item => item.action_id === selectedProMove)) {
      toast({
        title: "Duplicate Pro Move",
        description: "This Pro Move is already in the week list.",
        variant: "destructive"
      });
      return;
    }

    const newItem: WeekListItem = {
      action_id: proMove.action_id,
      action_statement: proMove.action_statement,
      display_order: weekList.length + 1
    };

    setWeekList([...weekList, newItem]);
    setSelectedProMove(null);
  };

  const removeFromWeekList = (actionId: number) => {
    const updatedList = weekList
      .filter(item => item.action_id !== actionId)
      .map((item, index) => ({ ...item, display_order: index + 1 }));
    setWeekList(updatedList);
  };

  const canSave = () => {
    return selectedCycle && selectedWeek && selectedRole && weekList.length === 3;
  };

  const handleSave = async () => {
    if (!canSave()) return;

    setLoading(true);
    try {
      // Delete existing rows for this cycle/week/role
      await supabase
        .from('weekly_focus')
        .delete()
        .eq('cycle', selectedCycle)
        .eq('week_in_cycle', selectedWeek)
        .eq('role_id', selectedRole);

      // Insert new rows
      const insertData = weekList.map(item => ({
        cycle: selectedCycle,
        week_in_cycle: selectedWeek,
        role_id: selectedRole,
        action_id: item.action_id,
        display_order: item.display_order,
        // Legacy fields required by current types (will be removed in next migration)
        iso_year: new Date().getFullYear(),
        iso_week: 1
      }));

      const { error } = await supabase
        .from('weekly_focus')
        .insert(insertData);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Week focus saved successfully!",
      });

      // Reset form
      setWeekList([]);
      setSelectedWeek(null);
      setSelectedCompetency(null);
      setSelectedProMove(null);

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save week focus.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Admin Focus Builder</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selectors Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Build Week Focus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cycle Selector */}
            <div className="space-y-2">
              <Label>Cycle</Label>
              <div className="flex gap-2">
                <Select value={selectedCycle?.toString()} onValueChange={(value) => setSelectedCycle(parseInt(value))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    {cycles.map(cycle => (
                      <SelectItem key={cycle} value={cycle.toString()}>
                        Cycle {cycle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </div>

            {/* Week Selector */}
            <div className="space-y-2">
              <Label>Week</Label>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map(week => (
                  <Button
                    key={week}
                    variant={selectedWeek === week ? "default" : "outline"}
                    onClick={() => setSelectedWeek(week)}
                    className="h-10"
                  >
                    {week}
                  </Button>
                ))}
              </div>
            </div>

            {/* Role Selector */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole?.toString()} onValueChange={(value) => setSelectedRole(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.role_id} value={role.role_id.toString()}>
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Competency Selector */}
            <div className="space-y-2">
              <Label>Competency</Label>
              <Select 
                value={selectedCompetency?.toString()} 
                onValueChange={(value) => setSelectedCompetency(parseInt(value))}
                disabled={!selectedRole}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select competency" />
                </SelectTrigger>
                <SelectContent>
                  {competencies.map(comp => (
                    <SelectItem key={comp.competency_id} value={comp.competency_id.toString()}>
                      {comp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pro Move Selector */}
            <div className="space-y-2">
              <Label>Pro Move</Label>
              <Select 
                value={selectedProMove?.toString()} 
                onValueChange={(value) => setSelectedProMove(parseInt(value))}
                disabled={!selectedCompetency}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select pro move" />
                </SelectTrigger>
                <SelectContent>
                  {proMoves.map(move => (
                    <SelectItem key={move.action_id} value={move.action_id.toString()}>
                      {move.action_statement}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={addToWeekList} 
              disabled={!selectedProMove || weekList.length >= 3}
              className="w-full"
            >
              Add to Week List
            </Button>
          </CardContent>
        </Card>

        {/* Week List Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Week List ({weekList.length}/3)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {weekList.map((item, index) => (
                <div key={item.action_id} className="flex items-center gap-3 p-3 border rounded">
                  <span className="font-semibold text-sm">{index + 1}.</span>
                  <span className="flex-1 text-sm">{item.action_statement}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFromWeekList(item.action_id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {weekList.length === 0 && (
                <p className="text-muted-foreground text-center py-8">
                  No pro moves added yet. Select moves above to build the week focus.
                </p>
              )}
            </div>

            <Button 
              onClick={handleSave}
              disabled={!canSave() || loading}
              className="w-full mt-4"
            >
              {loading ? "Saving..." : "SAVE"}
            </Button>
            
            {weekList.length < 3 && (
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Add exactly 3 pro moves to enable saving
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}