import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Mail } from "lucide-react";

interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  id: string;
  name: string;
  organization_id?: string;
}

interface Organization {
  id: string;
  name: string;
}

interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Role[];
  locations: Location[];
  organizations: Organization[];
}

export function InviteUserDialog({ open, onClose, onSuccess, roles, locations, organizations }: InviteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [invitedName, setInvitedName] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    organization_id: "",
    role_id: "",
    location_id: "",
  });

  // Filter locations based on selected organization
  const filteredLocations = useMemo(() => {
    if (!formData.organization_id) return [];
    return locations.filter(loc => loc.organization_id === formData.organization_id);
  }, [formData.organization_id, locations]);

  // Check if form is valid (all required fields filled)
  const isFormValid = formData.email && formData.name && formData.organization_id && formData.role_id && formData.location_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'invite_user',
          email: formData.email,
          name: formData.name,
          role_id: parseInt(formData.role_id),
          location_id: formData.location_id,
        },
      });

      // Handle edge function errors (non-2xx responses include error in data)
      if (error) {
        // Try to get the actual error message from the response
        const errorMessage = data?.error || error.message || "Failed to invite user";
        throw new Error(errorMessage);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }

      setInvitedName(formData.name);
      setInviteSent(true);

      toast({
        title: "Invite sent!",
        description: `${formData.name} will receive an email to set up their account.`,
      });
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
      organization_id: "",
      role_id: "",
      location_id: "",
    });
    setInviteSent(false);
    setInvitedName("");
    onClose();
  };

  const finishInvite = () => {
    handleClose();
    onSuccess();
  };

  // Reset location when organization changes
  const handleOrganizationChange = (orgId: string) => {
    setFormData({ 
      ...formData, 
      organization_id: orgId,
      location_id: "" // Clear location when org changes
    });
  };

  if (inviteSent) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Invite sent!</span>
            </DialogTitle>
            <DialogDescription>
              We've sent an email to {invitedName} with instructions to set up their account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            <div className="rounded-full bg-primary/10 p-4">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            They'll receive an email with a link to create their password and start using ProMoves.
          </p>
          <DialogFooter>
            <Button onClick={finishInvite} className="w-full">Done</Button>
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
            Add a new team member to ProMoves
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
            <Label htmlFor="organization">Organization *</Label>
            <Select value={formData.organization_id} onValueChange={handleOrganizationChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Select 
              value={formData.location_id} 
              onValueChange={(value) => setFormData({ ...formData, location_id: value })}
              disabled={!formData.organization_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={formData.organization_id ? "Select a location" : "Select organization first"} />
              </SelectTrigger>
              <SelectContent>
                {filteredLocations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              If they work at multiple locations, choose their primary location.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={formData.role_id} onValueChange={(value) => setFormData({ ...formData, role_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.role_id} value={role.role_id.toString()}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !isFormValid}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
