import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  id: string;
  name: string;
}

interface User {
  staff_id: string;
  user_id?: string;
  email?: string;
  name: string;
  role_id?: number;
  location_id?: string;
  organization_id?: string;
  is_super_admin: boolean;
  is_coach: boolean;
  is_lead: boolean;
  is_participant: boolean;
  coach_scope_type?: 'org' | 'location' | null;
  coach_scope_id?: string | null;
}

interface EditUserDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
  roles: Role[];
  locations: Location[];
  organizations: Array<{ id: string; name: string }>;
}

export function EditUserDrawer({ open, onClose, onSuccess, user, roles, locations, organizations }: EditUserDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'participant' | 'lead' | 'coach' | 'coach_participant' | 'super_admin'>('participant');
  const [scopeType, setScopeType] = useState<'org' | 'location'>('org');
  const [scopeId, setScopeId] = useState<string>("");

  useEffect(() => {
    if (user && open) {
      // Determine current action from flags
      if (user.is_super_admin) {
        setSelectedAction('super_admin');
      } else if (user.is_coach && user.is_participant) {
        setSelectedAction('coach_participant');
      } else if (user.is_coach && !user.is_participant) {
        setSelectedAction('coach');
      } else if (user.is_lead && user.is_participant) {
        setSelectedAction('lead');
      } else {
        setSelectedAction('participant');
      }
      
      // Prefill scope from user data
      if (user.coach_scope_type && user.coach_scope_id) {
        setScopeType(user.coach_scope_type);
        setScopeId(user.coach_scope_id);
      } else if (user.organization_id) {
        setScopeType('org');
        setScopeId(user.organization_id);
      } else if (user.location_id) {
        setScopeType('location');
        setScopeId(user.location_id);
      } else {
        setScopeType('org');
        setScopeId("");
      }
    }
  }, [user, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id) return;
    
    // Validate scope for Lead/Coach/Coach+Participant
    if ((selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') && !scopeId) {
      toast({
        title: "Scope required",
        description: "Scope type and scope are required for this action.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        action: 'role_preset',
        user_id: user.user_id,
        preset: selectedAction,
      };
      
      if (selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') {
        payload.coach_scope_type = scopeType;
        payload.coach_scope_id = scopeId;
      }
      
      const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
      
      if (error) throw error;
      
      const sideEffects = data?.side_effects;
      const message = sideEffects?.cleared_weekly_tasks 
        ? `User updated. Cleared ${sideEffects.deleted_scores} incomplete scores and ${sideEffects.deleted_selections} selections.`
        : "User updated successfully";
      
      toast({
        title: "Success",
        description: message,
      });
      
      onSuccess();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // Determine current status badge
  const getCurrentStatusBadge = () => {
    if (user.is_super_admin) return <Badge variant="destructive">Super Admin</Badge>;
    if (user.is_coach && user.is_participant) return <Badge variant="secondary">Coach + Participant</Badge>;
    if (user.is_coach && !user.is_participant) return <Badge variant="secondary">Coach</Badge>;
    if (user.is_lead && user.is_participant) return <Badge variant="outline">Lead RDA</Badge>;
    return <Badge>Participant</Badge>;
  };

  // Determine scope text
  const getScopeText = () => {
    if (!user.coach_scope_type || !user.coach_scope_id) return null;
    const scopeName = user.coach_scope_type === 'org' 
      ? organizations.find(o => o.id === user.coach_scope_id)?.name
      : locations.find(l => l.id === user.coach_scope_id)?.name;
    return scopeName ? `Scoped to: ${scopeName}` : null;
  };

  // Generate live summary
  const getLiveSummary = () => {
    const scopeName = scopeType === 'org'
      ? organizations.find(o => o.id === scopeId)?.name || "selected scope"
      : locations.find(l => l.id === scopeId)?.name || "selected scope";
    
    switch (selectedAction) {
      case 'participant':
        return `This will set ${user.name} to Participant.`;
      case 'lead':
        return scopeId
          ? `This will promote ${user.name} to Lead RDA scoped to ${scopeName} and maintain their participant tasks.`
          : `This will promote ${user.name} to Lead RDA (requires scope selection).`;
      case 'coach':
        return scopeId
          ? `This will promote ${user.name} to Coach scoped to ${scopeName} and remove participant tasks.`
          : `This will promote ${user.name} to Coach (requires scope selection).`;
      case 'coach_participant':
        return scopeId
          ? `This will promote ${user.name} to Coach + Participant scoped to ${scopeName} and maintain their participant tasks.`
          : `This will promote ${user.name} to Coach + Participant (requires scope selection).`;
      case 'super_admin':
        return `This will promote ${user.name} to Super Admin and remove participant tasks.`;
    }
  };

  const isSaveDisabled = loading || ((selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') && !scopeId);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
          <SheetDescription>
            Change role and permissions for this user
          </SheetDescription>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Header with Status */}
          <div className="space-y-2 pb-4 border-b">
            <div className="flex items-center gap-2">
              {getCurrentStatusBadge()}
            </div>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">{user.email || "No email"}</p>
              {getScopeText() && (
                <p className="text-xs text-muted-foreground">{getScopeText()}</p>
              )}
            </div>
          </div>

          {/* Action Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Choose new status</Label>
            <RadioGroup value={selectedAction} onValueChange={(value) => setSelectedAction(value as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="participant" id="action-participant" />
                <Label htmlFor="action-participant" className="font-normal cursor-pointer">Make Participant</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lead" id="action-lead" />
                <Label htmlFor="action-lead" className="font-normal cursor-pointer">Promote to Lead RDA</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coach" id="action-coach" />
                <Label htmlFor="action-coach" className="font-normal cursor-pointer">Promote to Coach</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coach_participant" id="action-coach-participant" />
                <Label htmlFor="action-coach-participant" className="font-normal cursor-pointer">Promote to Coach + Participant</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="super_admin" id="action-super-admin" />
                <Label htmlFor="action-super-admin" className="font-normal cursor-pointer">Promote to Super Admin</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Scope (Conditional) */}
          {(selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="space-y-2">
                <Label htmlFor="scope-type" className="text-sm font-semibold">Scope Type</Label>
                <Select value={scopeType} onValueChange={(value) => {
                  setScopeType(value as 'org' | 'location');
                  setScopeId(""); // Reset scope ID when type changes
                }}>
                  <SelectTrigger id="scope-type">
                    <SelectValue placeholder="Select scope type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Organization</SelectItem>
                    <SelectItem value="location">Location</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scope-value" className="text-sm font-semibold">
                  {scopeType === 'org' ? 'Organization' : 'Location'}
                </Label>
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger id="scope-value">
                    <SelectValue placeholder={`Select ${scopeType === 'org' ? 'organization' : 'location'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeType === 'org' 
                      ? organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))
                      : locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Live Summary */}
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm font-medium mb-1">This change will:</p>
            <p className="text-sm text-muted-foreground">{getLiveSummary()}</p>
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaveDisabled}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
