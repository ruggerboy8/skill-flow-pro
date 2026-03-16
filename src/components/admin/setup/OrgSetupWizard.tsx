import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2,
  Users,
  MapPin,
  Clock,
  Pencil,
  Plus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  PartyPopper,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Role {
  role_id: number;
  role_name: string;
  practice_type: string;
}

interface LocationData {
  id: string;
  name: string;
  timezone: string;
  conf_due_day: number;
  conf_due_time: string;
  perf_due_day: number;
  perf_due_time: string;
  group_id: string | null;
}

interface RoleSelection {
  checked: boolean;
  displayName: string;
}

interface ScheduleData {
  conf_due_day: number;
  conf_due_time: string;
  perf_due_day: number;
  perf_due_time: string;
}

export interface OrgSetupWizardProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Called after Step 3 saves successfully — parent can refresh setup status */
  onComplete: () => void;
  /** Called when user clicks "Invite Staff →" on the final screen */
  onInviteStaff: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Positions' },
  { id: 2, label: 'Locations' },
  { id: 3, label: 'Schedule' },
  { id: 4, label: 'Branding' },
  { id: 5, label: 'All Set!' },
];

const DAY_OPTIONS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgSetupWizard({
  open,
  onClose,
  organizationId,
  onComplete,
  onInviteStaff,
}: OrgSetupWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Step 1 — Positions
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<number, RoleSelection>>({});

  // Step 2 — Locations
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationEdits, setLocationEdits] = useState<Record<string, { name: string; timezone: string }>>({});
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', timezone: 'America/Chicago' });
  const [addingLocation, setAddingLocation] = useState(false);
  const [defaultGroupId, setDefaultGroupId] = useState<string | null>(null);

  // Step 3 — Schedule
  const [schedules, setSchedules] = useState<Record<string, ScheduleData>>({});

  // Step 4 — Branding
  const [appDisplayName, setAppDisplayName] = useState('');
  const [emailSignOff, setEmailSignOff] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [orgName, setOrgName] = useState('');

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setLoadingData(true);
    try {
      // Org practice_type + branding fields
      const { data: orgData } = await supabase
        .from('organizations')
        .select('practice_type, name, app_display_name, email_sign_off, reply_to_email')
        .eq('id', organizationId)
        .single();

      // Pre-populate branding fields
      const oName = orgData?.name || '';
      setOrgName(oName);
      setAppDisplayName(orgData?.app_display_name || oName);
      setEmailSignOff(orgData?.email_sign_off || `The ${oName} Team`);
      setReplyToEmail(orgData?.reply_to_email || '');

      // Load roles for this practice type; fall back to all active roles if none match
      const { data: typedRoles } = await supabase
        .from('roles')
        .select('role_id, role_name, practice_type')
        .eq('active', true)
        .eq('practice_type', orgData?.practice_type ?? '')
        .order('role_name');

      let finalRoles: Role[] = typedRoles ?? [];
      if (finalRoles.length === 0) {
        const { data: allRoles } = await supabase
          .from('roles')
          .select('role_id, role_name, practice_type')
          .eq('active', true)
          .order('role_name');
        finalRoles = allRoles ?? [];
      }
      setRoles(finalRoles);

      // Pre-populate role selections from existing overrides
      const { data: existingOverrides } = await supabase
        .from('organization_role_names')
        .select('role_id, display_name')
        .eq('org_id', organizationId);

      const overrideMap: Record<number, RoleSelection> = {};
      for (const role of finalRoles) {
        overrideMap[role.role_id] = { checked: false, displayName: '' };
      }
      for (const override of existingOverrides ?? []) {
        overrideMap[override.role_id] = { checked: true, displayName: override.display_name ?? '' };
      }
      setRoleSelections(overrideMap);

      // Load groups → locations
      const { data: groupsData } = await supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('active', true);

      const groupIds = (groupsData ?? []).map((g) => g.id);
      setDefaultGroupId(groupIds[0] ?? null);

      if (groupIds.length > 0) {
        const { data: locsData } = await supabase
          .from('locations')
          .select('id, name, timezone, conf_due_day, conf_due_time, perf_due_day, perf_due_time, group_id')
          .in('group_id', groupIds)
          .eq('active', true)
          .order('name');

        const locs: LocationData[] = (locsData ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          timezone: l.timezone ?? 'America/Chicago',
          conf_due_day: l.conf_due_day ?? 1,
          conf_due_time: (l.conf_due_time ?? '14:00:00').slice(0, 5),
          perf_due_day: l.perf_due_day ?? 4,
          perf_due_time: (l.perf_due_time ?? '17:00:00').slice(0, 5),
          group_id: l.group_id,
        }));

        setLocations(locs);

        // Init edits and schedules from loaded data
        const edits: Record<string, { name: string; timezone: string }> = {};
        const scheds: Record<string, ScheduleData> = {};
        for (const loc of locs) {
          edits[loc.id] = { name: loc.name, timezone: loc.timezone };
          scheds[loc.id] = {
            conf_due_day: loc.conf_due_day,
            conf_due_time: loc.conf_due_time,
            perf_due_day: loc.perf_due_day,
            perf_due_time: loc.perf_due_time,
          };
        }
        setLocationEdits(edits);
        setSchedules(scheds);
      }
    } catch (err) {
      console.error('OrgSetupWizard: error loading data', err);
    } finally {
      setLoadingData(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setEditingLocationId(null);
      setShowAddLocation(false);
      setNewLocation({ name: '', timezone: 'America/Chicago' });
      loadData();
    }
  }, [open, loadData]);

  // ── Step save handlers ───────────────────────────────────────────────────────

  const savePositions = async (): Promise<boolean> => {
    const checkedRoles = roles.filter((r) => roleSelections[r.role_id]?.checked);
    if (checkedRoles.length === 0) {
      toast({
        title: 'Select at least one position',
        description: 'Choose which roles exist at your practice before continuing.',
        variant: 'destructive',
      });
      return false;
    }

    setSaving(true);
    try {
      // Replace existing overrides for this org with the current selection
      await supabase.from('organization_role_names').delete().eq('org_id', organizationId);

      const inserts = checkedRoles.map((r) => ({
        org_id: organizationId,
        role_id: r.role_id,
        display_name: roleSelections[r.role_id]?.displayName?.trim() || r.role_name,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('organization_role_names').insert(inserts);
      if (error) throw error;
      return true;
    } catch (err: any) {
      toast({ title: 'Error saving positions', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveLocations = async (): Promise<boolean> => {
    setSaving(true);
    try {
      for (const loc of locations) {
        const edits = locationEdits[loc.id];
        if (!edits) continue;
        const nameChanged = edits.name.trim() !== loc.name;
        const tzChanged = edits.timezone !== loc.timezone;
        if (!nameChanged && !tzChanged) continue;

        const slug = edits.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { error } = await supabase
          .from('locations')
          .update({ name: edits.name.trim(), slug, timezone: edits.timezone })
          .eq('id', loc.id);
        if (error) throw error;
      }
      setEditingLocationId(null);
      return true;
    } catch (err: any) {
      toast({ title: 'Error saving locations', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSchedules = async (): Promise<boolean> => {
    setSaving(true);
    try {
      for (const loc of locations) {
        const sched = schedules[loc.id];
        if (!sched) continue;
        const { error } = await supabase
          .from('locations')
          .update({
            conf_due_day: sched.conf_due_day,
            conf_due_time: sched.conf_due_time + ':00',
            perf_due_day: sched.perf_due_day,
            perf_due_time: sched.perf_due_time + ':00',
          })
          .eq('id', loc.id);
        if (error) throw error;
      }
      return true;
    } catch (err: any) {
      toast({ title: 'Error saving schedule', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Navigation ───────────────────────────────────────────────────────────────

  const saveBranding = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          app_display_name: appDisplayName.trim() || null,
          email_sign_off: emailSignOff.trim() || null,
          reply_to_email: replyToEmail.trim() || null,
        })
        .eq('id', organizationId);
      if (error) throw error;
      return true;
    } catch (err: any) {
      toast({ title: 'Error saving branding', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    let ok = true;
    if (step === 1) ok = await savePositions();
    if (step === 2) ok = await saveLocations();
    if (step === 3) ok = await saveSchedules();
    if (step === 4) {
      ok = await saveBranding();
      if (ok) onComplete();
    }
    if (ok) setStep((s) => Math.min(s + 1, 5));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  // ── Add location ─────────────────────────────────────────────────────────────

  const handleAddLocation = async () => {
    if (!newLocation.name.trim()) return;
    setAddingLocation(true);
    try {
      const slug = newLocation.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysUntilMonday = dayOfWeek === 1 ? 7 : ((8 - dayOfWeek) % 7) || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysUntilMonday);
      const startDate = monday.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('locations')
        .insert({
          name: newLocation.name.trim(),
          slug,
          group_id: defaultGroupId,
          active: true,
          timezone: newLocation.timezone,
          program_start_date: startDate,
          cycle_length_weeks: 13,
          conf_due_day: 1,
          conf_due_time: '14:00:00',
          perf_due_day: 4,
          perf_due_time: '17:00:00',
        })
        .select('id, name, timezone, conf_due_day, conf_due_time, perf_due_day, perf_due_time, group_id')
        .single();
      if (error) throw error;

      const newLoc: LocationData = {
        id: data.id,
        name: data.name,
        timezone: data.timezone ?? 'America/Chicago',
        conf_due_day: data.conf_due_day ?? 1,
        conf_due_time: (data.conf_due_time ?? '14:00:00').slice(0, 5),
        perf_due_day: data.perf_due_day ?? 4,
        perf_due_time: (data.perf_due_time ?? '17:00:00').slice(0, 5),
        group_id: data.group_id,
      };

      setLocations((prev) => [...prev, newLoc]);
      setLocationEdits((prev) => ({ ...prev, [data.id]: { name: newLoc.name, timezone: newLoc.timezone } }));
      setSchedules((prev) => ({
        ...prev,
        [data.id]: {
          conf_due_day: newLoc.conf_due_day,
          conf_due_time: newLoc.conf_due_time,
          perf_due_day: newLoc.perf_due_day,
          perf_due_time: newLoc.perf_due_time,
        },
      }));
      setNewLocation({ name: '', timezone: 'America/Chicago' });
      setShowAddLocation(false);
    } catch (err: any) {
      toast({ title: 'Error adding location', description: err.message, variant: 'destructive' });
    } finally {
      setAddingLocation(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((s, i) => {
        const isComplete = step > s.id;
        const isCurrent = step === s.id;
        return (
          <div key={s.id} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors',
                isComplete
                  ? 'bg-primary text-primary-foreground'
                  : isCurrent
                  ? 'bg-primary/15 text-primary border-2 border-primary'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : s.id}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-8 h-0.5 mx-1', step > s.id ? 'bg-primary' : 'bg-muted')} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Positions ────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Which positions exist at your practice?
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Check each role that applies. Add a custom display name to tailor it to your practice
          (e.g. "Dental Nurse" instead of "Dental Assistant").
        </p>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No roles are configured for this practice type yet. Contact your platform admin.
        </p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const sel = roleSelections[role.role_id] ?? { checked: false, displayName: '' };
            return (
              <div
                key={role.role_id}
                className={cn(
                  'flex items-center gap-3 p-3 border rounded-md transition-colors',
                  sel.checked ? 'bg-primary/5 border-primary/30' : 'bg-card',
                )}
              >
                <Checkbox
                  id={`role-${role.role_id}`}
                  checked={sel.checked}
                  onCheckedChange={(checked) =>
                    setRoleSelections((prev) => ({
                      ...prev,
                      [role.role_id]: { ...prev[role.role_id], checked: !!checked },
                    }))
                  }
                />
                <label
                  htmlFor={`role-${role.role_id}`}
                  className="flex-1 text-sm font-medium cursor-pointer select-none"
                >
                  {role.role_name}
                </label>
                {sel.checked && (
                  <Input
                    placeholder="Custom display name (optional)"
                    value={sel.displayName}
                    onChange={(e) =>
                      setRoleSelections((prev) => ({
                        ...prev,
                        [role.role_id]: { ...prev[role.role_id], displayName: e.target.value },
                      }))
                    }
                    className="w-52 h-8 text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Step 2: Locations ────────────────────────────────────────────────────────

  const renderStep2 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Confirm your locations
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review your location name and timezone. Add additional locations if your practice has
          multiple sites.
        </p>
      </div>

      <div className="space-y-2">
        {locations.map((loc) => {
          const isEditingThis = editingLocationId === loc.id;
          const edits = locationEdits[loc.id] ?? { name: loc.name, timezone: loc.timezone };
          const tzLabel =
            TIMEZONE_OPTIONS.find((tz) => tz.value === edits.timezone)?.label ?? edits.timezone;

          return (
            <div key={loc.id} className="border rounded-md overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">{edits.name}</p>
                  <p className="text-xs text-muted-foreground">{tzLabel}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingLocationId(isEditingThis ? null : loc.id)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {isEditingThis ? 'Done' : 'Edit'}
                </Button>
              </div>

              {isEditingThis && (
                <div className="px-3 pb-3 pt-2 border-t bg-muted/30 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={edits.name}
                      onChange={(e) =>
                        setLocationEdits((prev) => ({
                          ...prev,
                          [loc.id]: { ...prev[loc.id], name: e.target.value },
                        }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timezone</Label>
                    <Select
                      value={edits.timezone}
                      onValueChange={(v) =>
                        setLocationEdits((prev) => ({
                          ...prev,
                          [loc.id]: { ...prev[loc.id], timezone: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add location */}
      {!showAddLocation ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddLocation(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add another location
        </Button>
      ) : (
        <div className="border rounded-md p-3 space-y-3">
          <p className="text-sm font-medium">New Location</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              value={newLocation.name}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="East Side Office"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select
              value={newLocation.timezone}
              onValueChange={(v) => setNewLocation((prev) => ({ ...prev, timezone: v }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddLocation(false);
                setNewLocation({ name: '', timezone: 'America/Chicago' });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddLocation}
              disabled={addingLocation || !newLocation.name.trim()}
            >
              {addingLocation && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 3: Schedule ─────────────────────────────────────────────────────────

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Submission deadlines
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Set which day of the week staff must complete their pro move submissions. Submissions
          after the deadline are flagged as late.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No locations to configure.</p>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => {
            const nameDisplay = locationEdits[loc.id]?.name ?? loc.name;
            const sched = schedules[loc.id] ?? {
              conf_due_day: 1,
              conf_due_time: '14:00',
              perf_due_day: 4,
              perf_due_time: '17:00',
            };

            return (
              <div key={loc.id} className="border rounded-md p-3 space-y-3">
                <p className="text-sm font-medium">{nameDisplay}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Confidence due</Label>
                    <Select
                      value={sched.conf_due_day.toString()}
                      onValueChange={(v) =>
                        setSchedules((prev) => ({
                          ...prev,
                          [loc.id]: { ...prev[loc.id], conf_due_day: parseInt(v) },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value.toString()}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Performance due</Label>
                    <Select
                      value={sched.perf_due_day.toString()}
                      onValueChange={(v) =>
                        setSchedules((prev) => ({
                          ...prev,
                          [loc.id]: { ...prev[loc.id], perf_due_day: parseInt(v) },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value.toString()}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Step 4: Done ─────────────────────────────────────────────────────────────

  const renderStep4 = () => {
    const checkedCount = Object.values(roleSelections).filter((r) => r.checked).length;
    return (
      <div className="text-center space-y-5 py-4">
        <PartyPopper className="h-12 w-12 text-primary mx-auto" />
        <div>
          <h3 className="text-xl font-semibold">You're all set!</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Your practice is configured and ready. Invite your first team member to get started.
          </p>
        </div>
        <div className="text-sm text-left bg-muted/40 rounded-md p-4 space-y-1.5 max-w-xs mx-auto">
          <p className="font-medium text-center mb-2">Setup Summary</p>
          <p>
            ✓ <strong>{checkedCount}</strong> position{checkedCount !== 1 ? 's' : ''} configured
          </p>
          <p>
            ✓ <strong>{locations.length}</strong> location{locations.length !== 1 ? 's' : ''} ready
          </p>
          <p>✓ Submission deadlines set</p>
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col gap-0 p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl">Practice Setup</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Step {step} of {STEPS.length} — {STEPS[step - 1]?.label}
          </p>
        </DialogHeader>

        {renderStepIndicator()}

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1 pr-1">
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
            </>
          )}
        </div>

        {/* Navigation footer */}
        <div className="flex justify-between pt-4 border-t mt-4">
          {step > 1 && step < 4 ? (
            <Button variant="outline" onClick={handleBack} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button onClick={handleNext} disabled={saving || loadingData}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {step === 3 ? (
                'Finish Setup'
              ) : (
                <>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Go to Admin
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  onInviteStaff();
                }}
              >
                Invite Staff →
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
