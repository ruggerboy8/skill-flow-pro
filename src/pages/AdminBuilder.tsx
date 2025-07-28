import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';

import { StepBar } from '@/components/admin/StepBar';
import { CycleWeekGrid } from '@/components/admin/CycleWeekGrid';
import { CompetencyGrid } from '@/components/admin/CompetencyGrid';
import { ProMovePanel } from '@/components/admin/ProMovePanel';
import { SlotPreview, type SlotItem } from '@/components/admin/SlotPreview';

interface Role {
  role_id: number;
  role_name: string;
}

interface ProMove {
  action_id: number;
  action_statement: string;
  domain_name: string;
}

const ADMIN_EMAILS = ['johno@reallygoodconsulting.org'];

export default function AdminBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Access control
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
    return <Navigate to="/" replace />;
  }

  // State management
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [selectedCompetency, setSelectedCompetency] = useState<number | null>(null);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(false);

  const steps = ['Cycle', 'Week', 'Role', 'Competency', 'Pro Move'];

  // Load initial data
  useEffect(() => {
    loadRoles();
  }, []);

  // Update current step based on selections
  useEffect(() => {
    if (selectedCompetency) {
      setCurrentStep(4);
    } else if (selectedRole) {
      setCurrentStep(3);
    } else if (selectedWeek) {
      setCurrentStep(2);
    } else if (selectedCycle) {
      setCurrentStep(1);
    } else {
      setCurrentStep(0);
    }
  }, [selectedCycle, selectedWeek, selectedRole, selectedCompetency]);

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  const handleWeekSelect = (cycle: number, week: number) => {
    setSelectedCycle(cycle);
    setSelectedWeek(week);
    // Reset downstream selections
    setSelectedCompetency(null);
    setSlots([]);
  };

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(parseInt(roleId));
    // Reset downstream selections
    setSelectedCompetency(null);
    setSlots([]);
  };

  const handleCompetencySelect = (competencyId: number) => {
    setSelectedCompetency(competencyId);
    setSlots([]);
  };

  const handleProMoveSelect = (proMove: ProMove | null, selfSelect: boolean) => {
    if (slots.length >= 3) {
      toast({
        title: "Week Full",
        description: "Maximum 3 pro moves per week.",
        variant: "destructive"
      });
      return;
    }

    // Check for duplicates (only for non-self-select)
    if (proMove && slots.some(slot => slot.action_id === proMove.action_id)) {
      toast({
        title: "Duplicate Pro Move",
        description: "This pro move is already added to the week.",
        variant: "destructive"
      });
      return;
    }

    const newSlot: SlotItem = {
      id: `slot-${Date.now()}-${Math.random()}`,
      action_id: proMove?.action_id || null,
      action_statement: proMove?.action_statement || 'Self-Select',
      domain_name: proMove?.domain_name,
      self_select: selfSelect,
      display_order: slots.length + 1
    };

    setSlots([...slots, newSlot]);
  };

  const handleRemoveSlot = (id: string) => {
    const updatedSlots = slots
      .filter(slot => slot.id !== id)
      .map((slot, index) => ({ ...slot, display_order: index + 1 }));
    setSlots(updatedSlots);
  };

  const handleReorderSlots = (newOrder: SlotItem[]) => {
    setSlots(newOrder);
  };

  const canSave = () => {
    return selectedCycle && selectedWeek && selectedRole && slots.length === 3;
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
      const insertData = slots.map(slot => ({
        cycle: selectedCycle,
        week_in_cycle: selectedWeek,
        role_id: selectedRole,
        action_id: slot.action_id,
        self_select: slot.self_select,
        display_order: slot.display_order,
        // Legacy fields required by current types
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
      setSlots([]);
      setSelectedCompetency(null);

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

  const selectedRoleName = roles.find(r => r.role_id === selectedRole)?.role_name;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Admin Focus Builder</h1>
      
      <StepBar currentStep={currentStep} steps={steps} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Cycle/Week Grid + Role Selector */}
        <div className="space-y-6">
          <CycleWeekGrid
            selectedRole={selectedRole}
            onWeekSelect={handleWeekSelect}
            selectedCycle={selectedCycle}
            selectedWeek={selectedWeek}
          />
          
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole?.toString()} onValueChange={handleRoleSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {roles.map(role => (
                  <SelectItem key={role.role_id} value={role.role_id.toString()}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Middle Column: Competency Grid */}
        <div>
          <CompetencyGrid
            selectedRole={selectedRole}
            onCompetencySelect={handleCompetencySelect}
            selectedCompetency={selectedCompetency}
          />
        </div>

        {/* Right Column: Pro Move Panel */}
        <div>
          <ProMovePanel
            selectedCompetency={selectedCompetency}
            onProMoveSelect={handleProMoveSelect}
          />
        </div>
      </div>

      {/* Bottom Row: Slot Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SlotPreview
          slots={slots}
          onRemoveSlot={handleRemoveSlot}
          onReorderSlots={handleReorderSlots}
          selectedCycle={selectedCycle}
          selectedWeek={selectedWeek}
          selectedRole={selectedRoleName}
        />
        
        <div className="flex items-end">
          <div className="w-full space-y-4">
            <Button 
              onClick={handleSave}
              disabled={!canSave() || loading}
              className="w-full h-12 text-lg font-semibold"
            >
              {loading ? "Saving..." : "SAVE WEEK FOCUS"}
            </Button>
            
            {!canSave() && (
              <p className="text-sm text-muted-foreground text-center">
                {!selectedCycle || !selectedWeek ? "Select a week cell" :
                 !selectedRole ? "Select a role" :
                 slots.length < 3 ? `Add ${3 - slots.length} more pro moves` :
                 "Ready to save"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}