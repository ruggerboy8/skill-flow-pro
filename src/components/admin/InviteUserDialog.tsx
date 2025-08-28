import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, CheckCircle } from "lucide-react";

interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  id: string;
  name: string;
}

interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Role[];
  locations: Location[];
}

export function InviteUserDialog({ open, onClose, onSuccess, roles, locations }: InviteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [setupLink, setSetupLink] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    role_id: "",
    location_id: "",
    is_super_admin: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          role_id: formData.role_id === "none" ? null : (formData.role_id ? parseInt(formData.role_id) : null),
          location_id: formData.location_id === "none" ? null : (formData.location_id || null),
          is_super_admin: formData.is_super_admin,
        }),
      });

      if (error) throw error;

      setSetupLink(data.setup_link);

      toast({
        title: "Success",
        description: "User invited successfully",
      });

      if (!data.setup_link) {
        // User already existed, close immediately
        handleClose();
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to invite user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      email: "",
      name: "",
      role_id: "",
      location_id: "",
      is_super_admin: false,
    });
    setSetupLink(null);
    onClose();
  };

  const copySetupLink = async () => {
    if (setupLink) {
      await navigator.clipboard.writeText(setupLink);
      toast({
        title: "Copied",
        description: "Setup link copied to clipboard",
      });
    }
  };

  const finishInvite = () => {
    handleClose();
    onSuccess();
  };

  if (setupLink) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>User Invited Successfully</span>
            </DialogTitle>
            <DialogDescription>
              Share this setup link with {formData.name} to complete their account setup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Input value={setupLink} readOnly className="flex-1" />
              <Button onClick={copySetupLink} size="sm" variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              This link allows {formData.name} to set their password and access the system.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={finishInvite}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <DialogDescription>
            Add a new team member to the system
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="teammate@example.com"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Full name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
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
            <Label htmlFor="location">Location</Label>
            <Select value={formData.location_id} onValueChange={(value) => setFormData({ ...formData, location_id: value })}>
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
              id="super_admin"
              checked={formData.is_super_admin}
              onCheckedChange={(checked) => setFormData({ ...formData, is_super_admin: checked })}
            />
            <Label htmlFor="super_admin">Super administrator</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.email || !formData.name}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}