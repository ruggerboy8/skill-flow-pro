import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Mail, Users, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  id: string;
  name: string;
  group_id?: string;
}

interface Organization {
  id: string;
  name: string;
}

interface Capabilities {
  can_view_submissions: boolean;
  can_submit_evals: boolean;
  can_review_evals: boolean;
  can_invite_users: boolean;
  can_manage_users: boolean;
  can_manage_locations: boolean;
  can_manage_library: boolean;
  is_org_admin: boolean;
}

interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Role[];
  locations: Location[];
  organizations: Organization[];
}

type PersonType = "participant" | "team_member" | null;

const DEFAULT_CAPABILITIES: Capabilities = {
  can_view_submissions: false,
  can_submit_evals: false,
  can_review_evals: false,
  can_invite_users: false,
  can_manage_users: false,
  can_manage_locations: false,
  can_manage_library: false,
  is_org_admin: false,
};

export function InviteUserDialog({
  open,
  onClose,
  onSuccess,
  roles,
  locations,
  organizations,
}: InviteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [invitedName, setInvitedName] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    group_id: "",
    location_id: "",
  });

  // Who is this person?
  const [personType, setPersonType] = useState<PersonType>(null);

  // Participant-specific fields
  const [roleId, setRoleId] = useState("");
  const [participationStartAt, setParticipationStartAt] = useState("");

  // Team-member-specific fields
  const [capabilities, setCapabilities] = useState<Capabilities>({ ...DEFAULT_CAPABILITIES });

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredLocations = useMemo(() => {
    if (!formData.group_id) return [];
    return locations.filter((loc) => loc.group_id === formData.group_id);
  }, [formData.group_id, locations]);

  const isBasicValid =
    formData.email && formData.name && formData.group_id && formData.location_id && personType !== null;

  const isFormValid =
    isBasicValid &&
    (personType === "team_member" || (personType === "participant" && roleId));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGroupChange = (groupId: string) => {
    setFormData({ ...formData, group_id: groupId, location_id: "" });
  };

  const handleOrgAdminToggle = (checked: boolean) => {
    if (checked) {
      // Org admin implies all capabilities
      setCapabilities({
        can_view_submissions: true,
        can_submit_evals: true,
        can_review_evals: true,
        can_invite_users: true,
        can_manage_users: true,
        can_manage_locations: true,
        can_manage_library: true,
        is_org_admin: true,
      });
    } else {
      setCapabilities({ ...DEFAULT_CAPABILITIES });
    }
  };

  const handleCapabilityChange = (key: keyof Capabilities, checked: boolean) => {
    setCapabilities((prev) => ({
      ...prev,
      [key]: checked,
      // Unchecking any individual capability also clears is_org_admin
      is_org_admin: key === "is_org_admin" ? checked : false,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !personType) return;

    setLoading(true);

    try {
      const body: Record<string, any> = {
        action: "invite_user",
        email: formData.email,
        name: formData.name,
        location_id: formData.location_id,
        is_participant: personType === "participant",
      };

      if (personType === "participant") {
        body.role_id = parseInt(roleId);
        if (participationStartAt) {
          body.participation_start_at = participationStartAt;
        }
      } else {
        // Team member — send the capability flags
        body.capabilities = capabilities;
        // role_id intentionally omitted for non-participants
      }

      const { data, error } = await supabase.functions.invoke("admin-users", { body });

      if (error) {
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
    setFormData({ email: "", name: "", group_id: "", location_id: "" });
    setPersonType(null);
    setRoleId("");
    setParticipationStartAt("");
    setCapabilities({ ...DEFAULT_CAPABILITIES });
    setInviteSent(false);
    setInvitedName("");
    onClose();
  };

  const finishInvite = () => {
    handleClose();
    onSuccess();
  };

  // ── Success screen ────────────────────────────────────────────────────────

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
            <Button onClick={finishInvite} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <DialogDescription>Add a new team member to ProMoves</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Basic info ── */}
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
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Group *</Label>
            <Select value={formData.group_id} onValueChange={handleGroupChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select group" />
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
            <Label>Location *</Label>
            <Select
              value={formData.location_id}
              onValueChange={(value) => setFormData({ ...formData, location_id: value })}
              disabled={!formData.group_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={formData.group_id ? "Select a location" : "Select group first"}
                />
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
              If they work at multiple locations, choose their primary one.
            </p>
          </div>

          {/* ── Person type selection ── */}
          <div className="space-y-2">
            <Label>What will they do in ProMoves? *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPersonType("participant")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                  personType === "participant"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">Participant</span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  Submits Pro Moves, tracked for completion, earns certificates
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPersonType("team_member")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                  personType === "team_member"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">Team member</span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  Coach, admin, or support — not tracked for submissions
                </p>
              </button>
            </div>
          </div>

          {/* ── Participant fields ── */}
          {personType === "participant" && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={roleId} onValueChange={setRoleId}>
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
                <p className="text-xs text-muted-foreground">
                  Determines which Pro Moves are assigned to them.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Pro Moves start date (optional)</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={participationStartAt}
                  onChange={(e) => setParticipationStartAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Assignments only accrue from this date onward. Leave blank to start immediately.
                </p>
              </div>
            </div>
          )}

          {/* ── Team member capability toggles ── */}
          {personType === "team_member" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Capabilities</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select what this person can do. You can adjust these anytime.
                </p>
              </div>

              {/* Org admin shortcut */}
              <label className="flex items-start gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={capabilities.is_org_admin}
                  onCheckedChange={(checked) => handleOrgAdminToggle(checked === true)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium leading-none">Organisation admin</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Full access — manages users, locations, and the Pro Moves library
                  </p>
                </div>
              </label>

              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-2 mb-2">
                  Or choose individually
                </p>

                {[
                  {
                    key: "can_view_submissions" as const,
                    label: "View staff submissions",
                    description: "See Pro Move completion data across the team",
                  },
                  {
                    key: "can_submit_evals" as const,
                    label: "Evaluate staff",
                    description: "Score and submit evaluations for team members",
                  },
                  {
                    key: "can_review_evals" as const,
                    label: "Review evaluations",
                    description: "Approve or reject submitted evaluations",
                  },
                  {
                    key: "can_invite_users" as const,
                    label: "Invite users",
                    description: "Send invitations to new staff members",
                  },
                  {
                    key: "can_manage_users" as const,
                    label: "Manage users",
                    description: "Edit profiles and capabilities for existing staff",
                  },
                  {
                    key: "can_manage_locations" as const,
                    label: "Manage locations",
                    description: "Update location settings and schedules",
                  },
                  {
                    key: "can_manage_library" as const,
                    label: "Manage Pro Move library",
                    description: "Show or hide Pro Moves for this organisation",
                  },
                ].map(({ key, label, description }) => (
                  <label
                    key={key}
                    className={cn(
                      "flex items-start gap-3 rounded-md p-2 transition-colors",
                      capabilities.is_org_admin
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={capabilities[key]}
                      onCheckedChange={(checked) =>
                        !capabilities.is_org_admin &&
                        handleCapabilityChange(key, checked === true)
                      }
                      disabled={capabilities.is_org_admin}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm leading-none">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

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
