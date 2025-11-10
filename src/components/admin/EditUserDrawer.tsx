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
  organization?: { name: string };
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
  const [scopeIds, setScopeIds] = useState<string[]>([]);

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
      
      // Prefill scopes from user data (coach_scopes junction table)
      const scopes = (user as any).coach_scopes;
      if (scopes && scopes.scope_ids && scopes.scope_ids.length > 0) {
        setScopeType(scopes.scope_type);
        setScopeIds(scopes.scope_ids);
      } else {
        setScopeType('org');
        setScopeIds([]);
      }
    }
  }, [user, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id) return;
    
    // Validate scope for Lead/Coach/Coach+Participant
    if ((selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') && scopeIds.length === 0) {
      toast({
        title: "Scope required",
        description: "Please select at least one scope.",
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
        payload.coach_scope_ids = scopeIds;
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
    const scopes = (user as any).coach_scopes;
    if (!scopes || !scopes.scope_ids || scopes.scope_ids.length === 0) return null;
    
    const scopeNames = scopes.scope_type === 'org'
      ? scopes.scope_ids.map((id: string) => organizations.find(o => o.id === id)?.name).filter(Boolean)
      : scopes.scope_ids.map((id: string) => locations.find(l => l.id === id)?.name).filter(Boolean);
    
    return scopeNames.length > 0 ? `Scoped to: ${scopeNames.join(', ')}` : null;
  };

  // Generate live summary
  const getLiveSummary = () => {
    const scopeCount = scopeIds.length;
    const scopeNames = scopeType === 'org'
      ? scopeIds.map(id => organizations.find(o => o.id === id)?.name).filter(Boolean).join(', ')
      : scopeIds.map(id => locations.find(l => l.id === id)?.name).filter(Boolean).join(', ');
    
    const scopeText = scopeCount > 0 ? scopeNames : '[select scopes]';
    const scopeLabel = scopeType === 'org' ? 'organization(s)' : 'location(s)';
    
    switch (selectedAction) {
      case 'participant':
        return `This will set ${user.name} to Participant.`;
      case 'lead':
        return scopeCount > 0
          ? `This will promote ${user.name} to Lead RDA scoped to ${scopeCount} ${scopeLabel}: ${scopeText} and maintain their participant tasks.`
          : `This will promote ${user.name} to Lead RDA (requires scope selection).`;
      case 'coach':
        return scopeCount > 0
          ? `This will promote ${user.name} to Coach scoped to ${scopeCount} ${scopeLabel}: ${scopeText} and remove participant tasks.`
          : `This will promote ${user.name} to Coach (requires scope selection).`;
      case 'coach_participant':
        return scopeCount > 0
          ? `This will promote ${user.name} to Coach + Participant scoped to ${scopeCount} ${scopeLabel}: ${scopeText} and maintain their participant tasks.`
          : `This will promote ${user.name} to Coach + Participant (requires scope selection).`;
      case 'super_admin':
        return `This will promote ${user.name} to Super Admin and remove participant tasks.`;
    }
  };

  const isSaveDisabled = loading || ((selectedAction === 'lead' || selectedAction === 'coach' || selectedAction === 'coach_participant') && scopeIds.length === 0);

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
                  setScopeIds([]); // Reset scope IDs when type changes
                }}>
                  <SelectTrigger id="scope-type">
                    <SelectValue placeholder="Select scope type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Organizations (includes all locations in each org)</SelectItem>
                    <SelectItem value="location">Specific Locations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  {scopeType === 'org' ? 'Select Organizations' : 'Select Locations'} (multiple)
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-md bg-background">
                  {scopeType === 'org' 
                    ? (organizations.length > 0 ? organizations.map((org) => (
                        <label key={org.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={scopeIds.includes(org.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setScopeIds([...scopeIds, org.id]);
                              } else {
                                setScopeIds(scopeIds.filter(id => id !== org.id));
                              }
                            }}
                            className="rounded border-input"
                          />
                          <span className="text-sm">{org.name}</span>
                        </label>
                      )) : (
                        <p className="text-sm text-muted-foreground p-2">No organizations available</p>
                      ))
                    : (locations.length > 0 ? locations.map((location) => (
                        <label key={location.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={scopeIds.includes(location.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setScopeIds([...scopeIds, location.id]);
                              } else {
                                setScopeIds(scopeIds.filter(id => id !== location.id));
                              }
                            }}
                            className="rounded border-input"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{location.name}</span>
                            {location.organization && (
                              <span className="text-xs text-muted-foreground">{location.organization.name}</span>
                            )}
                          </div>
                        </label>
                      )) : (
                        <p className="text-sm text-muted-foreground p-2">No locations available</p>
                      ))
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  {scopeIds.length} selected
                </p>
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
