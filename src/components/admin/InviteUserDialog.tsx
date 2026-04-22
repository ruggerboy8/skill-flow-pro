import { useState, useMemo, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRoleDisplayNames } from "@/hooks/useRoleDisplayNames";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Mail, ChevronDown, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  suggestEmployeeWithConfidence,
  type DeputyEmployee,
  type MatchConfidence,
} from "@/lib/deputyMatching";

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

export interface Capabilities {
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

const CAPABILITY_ITEMS: Array<{ key: keyof Capabilities; label: string; description: string }> = [
  {
    key: "can_view_submissions",
    label: "View staff submissions",
    description: "See Pro Move completion data across the team",
  },
  {
    key: "can_submit_evals",
    label: "Evaluate staff",
    description: "Score and submit evaluations for team members",
  },
  {
    key: "can_review_evals",
    label: "Release evaluations",
    description: "Review and release submitted evaluations to staff",
  },
  {
    key: "can_invite_users",
    label: "Invite users",
    description: "Send invitations to new staff members",
  },
  {
    key: "can_manage_users",
    label: "Manage users",
    description: "Edit profiles and capabilities for existing staff",
  },
  {
    key: "can_manage_locations",
    label: "Manage locations",
    description: "Update location settings and schedules",
  },
  {
    key: "can_manage_library",
    label: "Manage Pro Move library",
    description: "Show or hide Pro Moves for this organisation",
  },
];

export function InviteUserDialog({
  open,
  onClose,
  onSuccess,
  roles,
  locations,
  organizations,
}: InviteUserDialogProps) {
  const { toast } = useToast();
  const { resolve: resolveRole } = useRoleDisplayNames();
  const { organizationId } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [invitedName, setInvitedName] = useState("");

  // Basic info
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    group_id: "",
    location_id: "",
  });

  // User type branching
  const [userType, setUserType] = useState<"clinic" | "central">("clinic");

  // Role (optional unless isParticipant)
  const [roleId, setRoleId] = useState("");

  // Participation
  const [isParticipant, setIsParticipant] = useState(false);
  const [participationStartAt, setParticipationStartAt] = useState("");

  // Capabilities (always sent, even for participants)
  const [capabilities, setCapabilities] = useState<Capabilities>({ ...DEFAULT_CAPABILITIES });

  // Permissions accordion open state
  const [showPermissions, setShowPermissions] = useState(false);

  const isCentralOffice = userType === "central";

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredLocations = useMemo(() => {
    if (!formData.group_id) return [];
    return locations.filter((loc) => loc.group_id === formData.group_id);
  }, [formData.group_id, locations]);

  // Whether any capability is enabled
  const hasAnyCapability = Object.entries(capabilities).some(
    ([key, val]) => key !== "is_org_admin" && val === true
  ) || capabilities.is_org_admin;

  // Send is disabled until basic info + (role if participant)
  const isFormValid = isCentralOffice
    ? !!formData.email && !!formData.name && hasAnyCapability
    : !!formData.email &&
      !!formData.name &&
      !!formData.location_id &&
      (!isParticipant || !!roleId);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGroupChange = (groupId: string) => {
    setFormData({ ...formData, group_id: groupId, location_id: "" });
  };

  const handleOrgAdminToggle = (checked: boolean) => {
    if (checked) {
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
      // Unchecking any individual capability clears the org admin shortcut
      is_org_admin: key === "is_org_admin" ? checked : false,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);

    try {
      const body: Record<string, any> = {
        action: "invite_user",
        email: formData.email,
        name: formData.name,
        is_participant: isCentralOffice ? false : isParticipant,
        // Always send capabilities — participants can also have additional permissions
        capabilities,
      };

      if (isCentralOffice) {
        // Central office: send organization_id, backend resolves a default location
        body.organization_id = organizationId;
      } else {
        body.location_id = formData.location_id;
      }

      if (isParticipant && roleId) {
        body.role_id = parseInt(roleId);
        if (participationStartAt) {
          body.participation_start_at = participationStartAt;
        }
      } else if (!isParticipant && roleId) {
        // Role is optional for non-participants (e.g. their clinical title)
        body.role_id = parseInt(roleId);
      }

      const { data, error } = await supabase.functions.invoke("admin-users", { body });

      if (error) {
        // supabase.functions.invoke may not parse the body on error, so check data first
        let errorMessage = "Failed to invite user";
        if (data?.error) {
          errorMessage = data.error;
        } else if (error.message?.includes("non-2xx")) {
          // Generic message — the edge function likely returned a descriptive error we couldn't read
          errorMessage = "The invitation failed. The email may already be registered. Please check and try again.";
        } else {
          errorMessage = error.message;
        }
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
    setUserType("clinic");
    setRoleId("");
    setIsParticipant(false);
    setParticipationStartAt("");
    setCapabilities({ ...DEFAULT_CAPABILITIES });
    setShowPermissions(false);
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

          {/* ── User type branching ── */}
          <div className="space-y-2">
            <Label>What type of user is this?</Label>
            <RadioGroup
              value={userType}
              onValueChange={(val: "clinic" | "central") => {
                setUserType(val);
                if (val === "central") {
                  setIsParticipant(false);
                  setShowPermissions(true);
                  setFormData({ ...formData, group_id: "", location_id: "" });
                  setRoleId("");
                }
              }}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="clinic" />
                <span className="text-sm">Clinic staff</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="central" />
                <span className="text-sm">Central office / Admin</span>
              </label>
            </RadioGroup>
            {isCentralOffice && (
              <p className="text-xs text-muted-foreground">
                This person won't be assigned to a specific clinic or receive Pro Moves.
              </p>
            )}
          </div>

          {/* ── Clinic-specific fields ── */}
          {!isCentralOffice && (
            <>
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

              {/* ── Role ── */}
              <div className="space-y-2">
                <Label>
                  Role{isParticipant ? " *" : " (optional)"}
                </Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.role_id} value={role.role_id.toString()}>
                        {resolveRole(role.role_id, role.role_name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isParticipant && (
                  <p className="text-xs text-muted-foreground">
                    Determines which Pro Moves are assigned to them.
                  </p>
                )}
              </div>

              {/* ── Pro Move programme enrollment ── */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    id="is-participant"
                    checked={isParticipant}
                    onCheckedChange={(checked) => setIsParticipant(checked === true)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium leading-none">
                      Enrolled in the Pro Move programme
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      They'll receive weekly Pro Move assignments and be tracked for completion.
                    </p>
                  </div>
                </label>

                {isParticipant && (
                  <div className="space-y-1 pt-1 pl-7">
                    <Label htmlFor="start-date" className="text-sm">
                      Start date (optional)
                    </Label>
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
                )}
              </div>
            </>
          )}

          {/* ── Additional permissions (collapsible) ── */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPermissions(!showPermissions)}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Additional permissions</span>
                {hasAnyCapability && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
                    {capabilities.is_org_admin
                      ? "Org admin"
                      : `${Object.entries(capabilities).filter(([k, v]) => k !== "is_org_admin" && v).length} selected`}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  showPermissions && "rotate-180"
                )}
              />
            </button>

            {showPermissions && (
              <div className="border-t border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Grant access to admin functions. You can adjust these anytime.
                </p>

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
                  {CAPABILITY_ITEMS.map(({ key, label, description }) => (
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
