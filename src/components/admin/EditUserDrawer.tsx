import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  const [scopeLocId, setScopeLocId] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    role_id: "",
    primary_location_id: "",
    is_super_admin: false,
    is_coach: false,
    is_lead: false,
  });

  useEffect(() => {
    if (user && open) {
      setFormData({
        name: user.name || "",
        role_id: user.role_id?.toString() || "",
        primary_location_id: user.location_id || "",
        is_super_admin: user.is_super_admin,
        is_coach: user.is_coach,
        is_lead: user.is_lead || false,
      });
      setScopeLocId(user.location_id || "");
    }
  }, [user, open]);

  const handlePresetClick = async (preset: string) => {
    if (!user?.user_id) return;
    
    // Validate scope requirements
    if ((preset === 'lead_rda' || preset === 'coach') && !scopeLocId) {
      toast({
        title: "Scope required",
        description: `${preset === 'lead_rda' ? 'Lead RDA' : 'Coach'} requires location scope`,
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'role_preset',
          user_id: user.user_id,
          preset,
          scope_location_id: scopeLocId || null,
        },
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `User role updated to ${preset.replace('_', ' ')}`,
      });
      
      onSuccess();
    } catch (error: any) {
      console.error("Error applying preset:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update role",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name || !user.user_id) return;

    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update_user',
          user_id: user.user_id,
          name: formData.name,
          role_id: formData.role_id === "none" ? null : (formData.role_id ? parseInt(formData.role_id) : null),
          location_id: formData.primary_location_id === "none" ? null : (formData.primary_location_id || null),
          is_super_admin: formData.is_super_admin,
          is_coach: formData.is_coach,
          is_lead: formData.is_lead,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User updated successfully",
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

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
          <SheetDescription>
            Update user information and permissions for {user.email || user.name}
          </SheetDescription>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          {/* Role & Scope Presets */}
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Quick Role Presets</Label>
              <p className="text-xs text-muted-foreground">
                Apply standardized role configurations with proper scoping
              </p>
            </div>
            
            {/* Location Scope Selector */}
            <div className="space-y-2">
              <Label htmlFor="scope-loc" className="text-xs">Location Scope (Required for Lead RDA / Coach)</Label>
              <Select value={scopeLocId} onValueChange={setScopeLocId}>
                <SelectTrigger id="scope-loc" className="h-8 text-xs">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Preset Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick('participant')}
                disabled={loading}
                className="text-xs"
              >
                Make Participant
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick('lead_rda')}
                disabled={loading || !scopeLocId}
                className="text-xs"
                title={!scopeLocId ? "Requires location scope" : ""}
              >
                Make Lead RDA
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick('coach')}
                disabled={loading || !scopeLocId}
                className="text-xs"
                title={!scopeLocId ? "Requires location scope" : ""}
              >
                Make Coach
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick('super_admin')}
                disabled={loading}
                className="text-xs"
              >
                Make Super Admin
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or edit manually</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Full name *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <Select value={formData.role_id} onValueChange={(value) => setFormData({ ...formData, role_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No role</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.role_id} value={role.role_id.toString()}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Select value={formData.primary_location_id} onValueChange={(value) => setFormData({ ...formData, primary_location_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="edit-super-admin"
              checked={formData.is_super_admin}
              onCheckedChange={(checked) => setFormData({ ...formData, is_super_admin: checked })}
            />
            <Label htmlFor="edit-super-admin">Super administrator</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="edit-coach"
              checked={formData.is_coach}
              onCheckedChange={(checked) => setFormData({ ...formData, is_coach: checked })}
            />
            <Label htmlFor="edit-coach">Coach</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="edit-lead"
              checked={formData.is_lead}
              onCheckedChange={(checked) => setFormData({ ...formData, is_lead: checked })}
            />
            <Label htmlFor="edit-lead">Lead RDA</Label>
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}