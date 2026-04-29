import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, PauseCircle, Wrench, ChevronDown, Stethoscope, Shield } from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

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
  group_id?: string;
  is_super_admin: boolean;
  is_coach: boolean;
  is_lead: boolean;
  is_participant: boolean;
  is_paused?: boolean;
  paused_at?: string | null;
  pause_reason?: string | null;
  coach_scope_type?: 'org' | 'location' | null;
  coach_scope_id?: string | null;
  created_at?: string;
  hire_date?: string | null;
  allow_backfill_until?: string | null;
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

interface EditUserDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
  roles: Role[];
  locations: Location[];
  organizations: Array<{ id: string; name: string }>;
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
  { key: "can_view_submissions", label: "View staff submissions", description: "See Pro Move completion data across the team" },
  { key: "can_submit_evals", label: "Evaluate staff", description: "Score and submit evaluations for team members" },
  { key: "can_review_evals", label: "Release evaluations", description: "Review and release submitted evaluations to staff" },
  { key: "can_invite_users", label: "Invite users", description: "Send invitations to new staff members" },
  { key: "can_manage_users", label: "Manage users", description: "Edit profiles and capabilities for existing staff" },
  { key: "can_manage_locations", label: "Manage locations", description: "Update location settings and schedules" },
  { key: "can_manage_library", label: "Manage Pro Move library", description: "Show or hide Pro Moves for this organisation" },
];

/** Maps a role preset to its suggested capability defaults */
function getPresetCapabilities(preset: string): Capabilities {
  switch (preset) {
    case 'participant':
      return { ...DEFAULT_CAPABILITIES };
    case 'lead':
      return { ...DEFAULT_CAPABILITIES, can_view_submissions: true };
    case 'coach':
      return { ...DEFAULT_CAPABILITIES, can_view_submissions: true, can_submit_evals: true, can_review_evals: true };
    case 'coach_participant':
      return { ...DEFAULT_CAPABILITIES, can_view_submissions: true, can_submit_evals: true, can_review_evals: true };
    case 'regional_manager':
      return {
        can_view_submissions: true, can_submit_evals: true, can_review_evals: true,
        can_invite_users: true, can_manage_users: true, can_manage_locations: true,
        can_manage_library: false, is_org_admin: true,
      };
    case 'super_admin':
      return {
        can_view_submissions: true, can_submit_evals: true, can_review_evals: true,
        can_invite_users: true, can_manage_users: true, can_manage_locations: true,
        can_manage_library: true, is_org_admin: true,
      };
    default:
      return { ...DEFAULT_CAPABILITIES };
  }
}

type PresetType = 'participant' | 'lead' | 'coach' | 'coach_participant' | 'regional_manager' | 'clinical_director' | 'super_admin';

const PARTICIPANT_PRESETS: PresetType[] = ['participant', 'lead', 'coach_participant'];

export function EditUserDrawer({ open, onClose, onSuccess, user, roles, locations, organizations }: EditUserDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // ── Existing state ─────────────────────────────────────────────────────────
  const [selectedAction, setSelectedAction] = useState<PresetType>('participant');
  const [scopeType, setScopeType] = useState<'org' | 'location'>('org');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [hireDate, setHireDate] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [pauseReason, setPauseReason] = useState<string>('');
  const [allowBackfill, setAllowBackfill] = useState<boolean>(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [doctorPortalAccess, setDoctorPortalAccess] = useState<boolean>(false);
  const [clinicalDirectorAccess, setClinicalDirectorAccess] = useState<boolean>(false);

  // ── New capability state ───────────────────────────────────────────────────
  const [capabilities, setCapabilities] = useState<Capabilities>({ ...DEFAULT_CAPABILITIES });
  const [participationStartAt, setParticipationStartAt] = useState<string>('');
  const [showPermissions, setShowPermissions] = useState(false);
  const [capsLoaded, setCapsLoaded] = useState(false); // tracks whether we've loaded from DB

  // ── Initialise on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !open) return;

    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setSelectedLocationId(user.location_id || '');
    setIsPaused(user.is_paused ?? false);
    setPauseReason(user.pause_reason || '');
    setCapsLoaded(false);
    setShowPermissions(false);
    setDoctorPortalAccess((user as any).is_doctor ?? false);
    setClinicalDirectorAccess((user as any).is_clinical_director ?? false);

    const hasActiveBackfill = user.allow_backfill_until && new Date(user.allow_backfill_until) > new Date();
    setAllowBackfill(!!hasActiveBackfill);

    // Determine preset from legacy flags (including clinical_director from main)
    let preset: PresetType = 'participant';
    if (user.is_super_admin) {
      preset = 'super_admin';
    } else if ((user as any).is_clinical_director) {
      preset = 'clinical_director';
    } else if ((user as any).is_org_admin) {
      preset = 'regional_manager';
    } else if (user.is_coach && user.is_participant) {
      preset = 'coach_participant';
    } else if (user.is_coach && !user.is_participant) {
      preset = 'coach';
    } else if (user.is_lead && user.is_participant) {
      preset = 'lead';
    }
    setSelectedAction(preset);

    const scopes = (user as any).coach_scopes;
    if (scopes?.scope_ids?.length > 0) {
      setScopeType(scopes.scope_type);
      setScopeIds(scopes.scope_ids);
    } else {
      setScopeType('org');
      setScopeIds([]);
    }

    setHireDate(user.hire_date?.slice(0, 10) || user.created_at?.slice(0, 10) || '');

    // Self-fetch user_capabilities from DB
    supabase
      .from('user_capabilities')
      .select('*')
      .eq('staff_id', user.staff_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Failed to fetch user_capabilities:', error);
        if (data) {
          setCapabilities({
            can_view_submissions: data.can_view_submissions ?? false,
            can_submit_evals: data.can_submit_evals ?? false,
            can_review_evals: data.can_review_evals ?? false,
            can_invite_users: data.can_invite_users ?? false,
            can_manage_users: data.can_manage_users ?? false,
            can_manage_locations: data.can_manage_locations ?? false,
            can_manage_library: data.can_manage_library ?? false,
            is_org_admin: data.is_org_admin ?? false,
          });
          setParticipationStartAt(data.participation_start_at?.slice(0, 10) || '');
        } else {
          // No row yet — use preset defaults as a starting point
          setCapabilities(getPresetCapabilities(preset));
          setParticipationStartAt('');
        }
        setCapsLoaded(true);
      });
  }, [user, open]);

  // When the admin changes the preset radio, suggest new capability defaults.
  // This intentionally replaces capabilities so the admin sees what the preset implies.
  const handlePresetChange = (newPreset: PresetType) => {
    setSelectedAction(newPreset);
    setCapabilities(getPresetCapabilities(newPreset));
  };

  // ── Capability handlers ────────────────────────────────────────────────────
  const handleOrgAdminToggle = (checked: boolean) => {
    if (checked) {
      setCapabilities({
        can_view_submissions: true, can_submit_evals: true, can_review_evals: true,
        can_invite_users: true, can_manage_users: true, can_manage_locations: true,
        can_manage_library: false, is_org_admin: true,
      });
    } else {
      setCapabilities({ ...DEFAULT_CAPABILITIES });
    }
  };

  const handleCapabilityChange = (key: keyof Capabilities, checked: boolean) => {
    setCapabilities((prev) => ({
      ...prev,
      [key]: checked,
      is_org_admin: key === 'is_org_admin' ? checked : false,
    }));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id) return;

    // Validate scope for Lead/Coach/Coach+Participant/Regional Manager/Clinical Director
    if (
      (selectedAction === 'lead' || selectedAction === 'coach' ||
       selectedAction === 'coach_participant' || selectedAction === 'regional_manager' ||
       selectedAction === 'clinical_director') &&
      scopeIds.length === 0
    ) {
      toast({
        title: "Scope required",
        description: "Please select at least one scope.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Handle pause/unpause separately if changed
      const pauseChanged = isPaused !== (user.is_paused ?? false);
      if (pauseChanged) {
        const pausePayload: any = { action: isPaused ? 'pause_user' : 'unpause_user', user_id: user.user_id };
        if (isPaused && pauseReason) pausePayload.reason = pauseReason;
        const { error: pauseError } = await supabase.functions.invoke('admin-users', { body: pausePayload });
        if (pauseError) throw pauseError;
      }

      // Main role_preset call — now includes capabilities and participation_start_at
      const payload: any = {
        action: 'role_preset',
        user_id: user.user_id,
        preset: selectedAction,
        hire_date: hireDate || null,
        name: editName.trim() || null,
        email: editEmail.trim() || null,
        allow_backfill: allowBackfill,
        location_id: selectedLocationId || null,
        capabilities,
        participation_start_at: PARTICIPANT_PRESETS.includes(selectedAction) && participationStartAt
          ? participationStartAt
          : null,
        // Doctor portal access and Clinical Director access are layered additively on top of any preset.
        // A user can be both — e.g. a Clinical Director who is also a participating doctor.
        is_doctor: doctorPortalAccess,
        is_clinical_director: clinicalDirectorAccess,
      };

      if (selectedAction === 'lead' || selectedAction === 'coach' ||
          selectedAction === 'coach_participant' || selectedAction === 'regional_manager' ||
          selectedAction === 'clinical_director') {
        payload.coach_scope_type = scopeType;
        payload.coach_scope_ids = scopeIds;
      }

      const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
      if (error) throw error;

      const sideEffects = data?.side_effects;
      let message = "User updated successfully";
      if (pauseChanged && isPaused) {
        message = `User paused successfully`;
      } else if (pauseChanged && !isPaused) {
        message = `User unpaused successfully`;
      } else if (sideEffects?.cleared_weekly_tasks) {
        message = `User updated. Cleared ${sideEffects.deleted_scores} incomplete scores and ${sideEffects.deleted_selections} selections.`;
      }

      toast({ title: "Success", description: message });
      onSuccess();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getCurrentStatusBadge = () => {
    if (user.is_super_admin) return <Badge variant="destructive">Super Admin</Badge>;
    if ((user as any).is_clinical_director) return <Badge className="bg-teal-600 hover:bg-teal-700 text-white">Clinical Director</Badge>;
    if ((user as any).is_org_admin) return <Badge className="bg-amber-500 hover:bg-amber-600">Regional Manager</Badge>;
    if (user.is_coach && user.is_participant) return <Badge variant="secondary">Coach + Participant</Badge>;
    if (user.is_coach && !user.is_participant) return <Badge variant="secondary">Coach</Badge>;
    if (user.is_lead && user.is_participant) return <Badge variant="outline">Lead RDA</Badge>;
    return <Badge>Participant</Badge>;
  };

  const getScopeText = () => {
    const scopes = (user as any).coach_scopes;
    if (!scopes?.scope_ids?.length) return null;
    const scopeNames = scopes.scope_type === 'org'
      ? scopes.scope_ids.map((id: string) => organizations.find(o => o.id === id)?.name).filter(Boolean)
      : scopes.scope_ids.map((id: string) => locations.find(l => l.id === id)?.name).filter(Boolean);
    return scopeNames.length > 0 ? `Scoped to: ${scopeNames.join(', ')}` : null;
  };

  const getLiveSummary = () => {
    const scopeCount = scopeIds.length;
    const scopeNames = scopeType === 'org'
      ? scopeIds.map(id => organizations.find(o => o.id === id)?.name).filter(Boolean).join(', ')
      : scopeIds.map(id => locations.find(l => l.id === id)?.name).filter(Boolean).join(', ');
    const scopeText = scopeCount > 0 ? scopeNames : '[select scopes]';
    const scopeLabel = scopeType === 'org' ? 'group(s)' : 'location(s)';

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
      case 'regional_manager':
        return scopeCount > 0
          ? `This will promote ${user.name} to Regional Manager with admin powers for ${scopeCount} ${scopeLabel}: ${scopeText}. They will NOT do weekly ProMoves.`
          : `This will promote ${user.name} to Regional Manager (requires scope selection).`;
      case 'clinical_director':
        return scopeCount > 0
          ? `This will promote ${user.name} to Clinical Director with coach + admin powers for ${scopeCount} ${scopeLabel}: ${scopeText}, plus access to the Clinical tab.`
          : `This will promote ${user.name} to Clinical Director (requires scope selection).`;
      case 'super_admin':
        return `This will promote ${user.name} to Super Admin and remove participant tasks.`;
    }
  };

  const hasAnyCapability =
    Object.entries(capabilities).some(([k, v]) => k !== 'is_org_admin' && v === true) ||
    capabilities.is_org_admin;

  const isSaveDisabled =
    loading ||
    !capsLoaded ||
    ((selectedAction === 'lead' || selectedAction === 'coach' ||
      selectedAction === 'coach_participant' || selectedAction === 'regional_manager' ||
      selectedAction === 'clinical_director') &&
      scopeIds.length === 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        className="w-[500px] sm:max-w-[500px] overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
          <SheetDescription>Change role and permissions for this user</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Current status */}
          <div className="space-y-2 pb-4 border-b">
            <div className="flex items-center gap-2">
              {getCurrentStatusBadge()}
            </div>
            {getScopeText() && (
              <p className="text-xs text-muted-foreground">{getScopeText()}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="User's full name"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Changing email will update both the staff record and auth account
            </p>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="edit-location">Primary Location</Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger id="edit-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    <div className="flex flex-col">
                      <span>{location.name}</span>
                      {location.organization && (
                        <span className="text-xs text-muted-foreground">{location.organization.name}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hire Date */}
          <div className="space-y-2">
            <Label htmlFor="hire-date">Hire Date</Label>
            <Input
              id="hire-date"
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Submissions become required starting the Monday after hire date + onboarding weeks buffer
            </p>
          </div>

          {/* Pause Account */}
          <div className="space-y-3 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PauseCircle className="h-5 w-5 text-amber-600" />
                <Label htmlFor="pause-toggle" className="text-sm font-semibold cursor-pointer">
                  Pause Account
                </Label>
              </div>
              <Switch id="pause-toggle" checked={isPaused} onCheckedChange={setIsPaused} />
            </div>
            <p className="text-xs text-muted-foreground">
              When paused, this user won't receive assignments or be marked for missed submissions. Use for maternity leave, extended absence, etc.
            </p>
            {isPaused && (
              <Input
                placeholder="Reason (optional, e.g. Maternity leave - returns April 2026)"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Backfill */}
          <div className="space-y-3 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-blue-600" />
                <Label htmlFor="backfill-toggle" className="text-sm font-semibold cursor-pointer">
                  Temporary Backfill Access
                </Label>
              </div>
              <Switch id="backfill-toggle" checked={allowBackfill} onCheckedChange={setAllowBackfill} />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, this user can backfill missing confidence scores for past weeks. Permission auto-expires in 7 days.
            </p>
            {allowBackfill && user?.allow_backfill_until && new Date(user.allow_backfill_until) > new Date() && (
              <p className="text-xs font-medium text-blue-600">
                Expires: {format(new Date(user.allow_backfill_until), 'MMM d, yyyy')} ({differenceInDays(new Date(user.allow_backfill_until), new Date())} days remaining)
              </p>
            )}
            {allowBackfill && (!user?.allow_backfill_until || new Date(user.allow_backfill_until) <= new Date()) && (
              <p className="text-xs font-medium text-blue-600">
                Will expire: {format(addDays(new Date(), 7), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {/* Doctor Portal Access (additive — works alongside any role, including Clinical Director) */}
          <div className="space-y-3 p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-lg border border-teal-200/50 dark:border-teal-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-teal-600" />
                <Label htmlFor="doctor-toggle" className="text-sm font-semibold cursor-pointer">
                  Doctor Portal Access
                </Label>
              </div>
              <Switch
                id="doctor-toggle"
                checked={doctorPortalAccess}
                onCheckedChange={setDoctorPortalAccess}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, this user appears in the Clinical Director portal as a doctor and gets a "Doctor" link in their sidebar. Use this for any user (admin, coach, or even a Clinical Director) who is also a practicing doctor. Their existing role and permissions are preserved.
            </p>
          </div>

          {/* Clinical Director Access (additive — independent of role preset) */}
          <div className="space-y-3 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                <Label htmlFor="cd-toggle" className="text-sm font-semibold cursor-pointer">
                  Clinical Director Access
                </Label>
              </div>
              <Switch
                id="cd-toggle"
                checked={clinicalDirectorAccess}
                onCheckedChange={setClinicalDirectorAccess}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, this user gets a "Clinical" link in their sidebar and can invite and manage doctors from the Clinical Director Portal. Combine with Doctor Portal Access above to let a clinical director also participate as a doctor.
            </p>
          </div>

          {/* Role preset */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Choose new status</Label>
            <RadioGroup value={selectedAction} onValueChange={(v) => handlePresetChange(v as PresetType)}>
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
                <RadioGroupItem value="regional_manager" id="action-regional-manager" />
                <Label htmlFor="action-regional-manager" className="font-normal cursor-pointer">Promote to Regional Manager (Admin powers)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="clinical_director" id="action-clinical-director" />
                <Label htmlFor="action-clinical-director" className="font-normal cursor-pointer">Promote to Clinical Director (Admin + Clinical tab)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="super_admin" id="action-super-admin" />
                <Label htmlFor="action-super-admin" className="font-normal cursor-pointer">Promote to Super Admin</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Scope (Conditional) */}
          {(selectedAction === 'lead' || selectedAction === 'coach' ||
            selectedAction === 'coach_participant' || selectedAction === 'regional_manager' ||
            selectedAction === 'clinical_director') && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="space-y-2">
                <Label htmlFor="scope-type" className="text-sm font-semibold">Scope Type</Label>
                <Select value={scopeType} onValueChange={(value) => {
                  setScopeType(value as 'org' | 'location');
                  setScopeIds([]);
                }}>
                  <SelectTrigger id="scope-type">
                    <SelectValue placeholder="Select scope type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Groups (includes all locations in each group)</SelectItem>
                    <SelectItem value="location">Specific Locations</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  {scopeType === 'org' ? 'Select Groups' : 'Select Locations'} (multiple)
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-md bg-background">
                  {scopeType === 'org'
                    ? (organizations.length > 0 ? organizations.map((org) => (
                        <label key={org.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={scopeIds.includes(org.id)}
                            onChange={(e) => {
                              if (e.target.checked) setScopeIds([...scopeIds, org.id]);
                              else setScopeIds(scopeIds.filter(id => id !== org.id));
                            }}
                            className="rounded border-input"
                          />
                          <span className="text-sm">{org.name}</span>
                        </label>
                      )) : <p className="text-sm text-muted-foreground p-2">No groups available</p>)
                    : (locations.length > 0 ? locations.map((location) => (
                        <label key={location.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={scopeIds.includes(location.id)}
                            onChange={(e) => {
                              if (e.target.checked) setScopeIds([...scopeIds, location.id]);
                              else setScopeIds(scopeIds.filter(id => id !== location.id));
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
                      )) : <p className="text-sm text-muted-foreground p-2">No locations available</p>)
                  }
                </div>
                <p className="text-xs text-muted-foreground">{scopeIds.length} selected</p>
              </div>
            </div>
          )}

          {/* Participation start date (for presets that include is_participant) */}
          {PARTICIPANT_PRESETS.includes(selectedAction) && (
            <div className="space-y-2">
              <Label htmlFor="participation-start">Pro Move start date (optional)</Label>
              <Input
                id="participation-start"
                type="date"
                value={participationStartAt}
                onChange={(e) => setParticipationStartAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Assignments only accrue from this date onward. Leave blank to use hire date / original start.
              </p>
            </div>
          )}

          {/* Fine-tune permissions (collapsible) */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPermissions(!showPermissions)}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Fine-tune permissions</span>
                {!capsLoaded && (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                )}
                {capsLoaded && hasAnyCapability && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
                    {capabilities.is_org_admin
                      ? "Org admin"
                      : `${Object.entries(capabilities).filter(([k, v]) => k !== 'is_org_admin' && v).length} enabled`}
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
                  Capabilities are pre-filled from the selected role. Adjust individually as needed.
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
                          !capabilities.is_org_admin && handleCapabilityChange(key, checked === true)
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

          {/* Live summary */}
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
