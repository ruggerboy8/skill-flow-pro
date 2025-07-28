import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

interface Role {
  role_id: number;
  role_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
  code: string;
  domain_name: string;
}

interface ProMove {
  action_id: number;
  action_statement: string;
}

interface SlotData {
  competency_id: number | null;
  action_id: number | null;
  is_self_select: boolean;
}

export default function WeekEditor() {
  const { roleId, cycle, week } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [role, setRole] = useState<Role | null>(null);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [proMoves, setProMoves] = useState<{ [key: number]: ProMove[] }>({});
  const [loading, setLoading] = useState(false);
  
  const [slots, setSlots] = useState<SlotData[]>([
    { competency_id: null, action_id: null, is_self_select: false },
    { competency_id: null, action_id: null, is_self_select: false },
    { competency_id: null, action_id: null, is_self_select: false }
  ]);

  useEffect(() => {
    if (roleId) {
      loadRole();
      loadCompetencies();
      loadExistingData();
    }
  }, [roleId, cycle, week]);

  const loadRole = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .eq('role_id', parseInt(roleId!))
      .single();
    
    if (data) setRole(data);
  };

  const loadCompetencies = async () => {
    const { data } = await supabase
      .from('competencies')
      .select(`
        competency_id, 
        name, 
        code,
        domains!inner(domain_name)
      `)
      .eq('role_id', parseInt(roleId!))
      .order('name');
    
    if (data) {
      const formattedCompetencies = data.map(item => ({
        competency_id: item.competency_id,
        name: item.name,
        code: item.code,
        domain_name: (item.domains as any).domain_name
      }));
      setCompetencies(formattedCompetencies);
    }
  };

  const loadProMoves = async (competencyId: number) => {
    if (proMoves[competencyId]) return;

    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement')
      .eq('competency_id', competencyId)
      .order('action_statement');

    if (data) {
      setProMoves(prev => ({ ...prev, [competencyId]: data }));
    }
  };

  const loadExistingData = async () => {
    const { data } = await supabase
      .from('weekly_focus')
      .select('competency_id, action_id, self_select, display_order')
      .eq('cycle', parseInt(cycle!))
      .eq('week_in_cycle', parseInt(week!))
      .eq('role_id', parseInt(roleId!))
      .order('display_order');

    if (data && data.length > 0) {
      const newSlots = [...slots];
      data.forEach((item, index) => {
        if (index < 3) {
          newSlots[index] = {
            competency_id: item.competency_id,
            action_id: item.action_id,
            is_self_select: item.self_select
          };
        }
      });
      setSlots(newSlots);
    }
  };

  const handleCompetencyChange = (slotIndex: number, competencyId: string) => {
    const newSlots = [...slots];
    newSlots[slotIndex] = {
      competency_id: parseInt(competencyId),
      action_id: null,
      is_self_select: false
    };
    setSlots(newSlots);
    
    loadProMoves(parseInt(competencyId));
  };

  const handleProMoveChange = (slotIndex: number, value: string) => {
    const newSlots = [...slots];
    if (value === 'self-select') {
      newSlots[slotIndex].action_id = null;
      newSlots[slotIndex].is_self_select = true;
    } else {
      newSlots[slotIndex].action_id = parseInt(value);
      newSlots[slotIndex].is_self_select = false;
    }
    setSlots(newSlots);
  };

  // Group competencies by domain
  const competenciesByDomain = competencies.reduce((acc, comp) => {
    if (!acc[comp.domain_name]) {
      acc[comp.domain_name] = [];
    }
    acc[comp.domain_name].push(comp);
    return acc;
  }, {} as Record<string, Competency[]>);

  const domains = Object.keys(competenciesByDomain).sort();

  const canSave = () => {
    return slots.every(slot => 
      slot.competency_id !== null && 
      (slot.action_id !== null || slot.is_self_select)
    );
  };

  const handleSave = async () => {
    if (!canSave()) return;

    setLoading(true);
    try {
      // Delete existing rows
      await supabase
        .from('weekly_focus')
        .delete()
        .eq('cycle', parseInt(cycle!))
        .eq('week_in_cycle', parseInt(week!))
        .eq('role_id', parseInt(roleId!));

      // Insert new rows
      const insertData = slots.map((slot, index) => ({
        cycle: parseInt(cycle!),
        week_in_cycle: parseInt(week!),
        role_id: parseInt(roleId!),
        competency_id: slot.competency_id,
        action_id: slot.action_id,
        self_select: slot.is_self_select,
        display_order: index + 1,
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

      navigate(`/builder/${roleId}/${cycle}`);

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
    <div className="container mx-auto p-6">
      <div className="sticky top-0 bg-background border-b mb-6 pb-4">
        <h1 className="text-3xl font-bold">
          {role?.role_name} · Cycle {cycle} · Week {week}
        </h1>
      </div>
      
      <div className="space-y-6">
        {slots.map((slot, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle>Competency {index + 1}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Competency</Label>
                  <Select 
                    value={slot.competency_id?.toString() || ""} 
                    onValueChange={(value) => handleCompetencyChange(index, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select competency" />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map(domainName => (
                        <SelectGroup key={domainName}>
                          <SelectLabel 
                            style={{ color: getDomainColor(domainName) }}
                            className="font-semibold"
                          >
                            {domainName}
                          </SelectLabel>
                          {competenciesByDomain[domainName].map(comp => (
                            <SelectItem 
                              key={comp.competency_id} 
                              value={comp.competency_id.toString()}
                              style={{ color: getDomainColor(domainName) }}
                              className="ml-2"
                            >
                              {comp.code} - {comp.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
              </div>

              {slot.competency_id && (
                <div>
                  <Label>Pro Move</Label>
                  <Select 
                    value={slot.is_self_select ? 'self-select' : slot.action_id?.toString() || ""} 
                    onValueChange={(value) => handleProMoveChange(index, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select pro move" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self-select">Self-Select</SelectItem>
                      {proMoves[slot.competency_id]?.map(move => (
                        <SelectItem key={move.action_id} value={move.action_id.toString()}>
                          {move.action_statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <div className="flex gap-4">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/builder/${roleId}/${cycle}`)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!canSave() || loading}
            className="flex-1"
          >
            {loading ? "Saving..." : "Save Week"}
          </Button>
        </div>
      </div>
    </div>
  );
}