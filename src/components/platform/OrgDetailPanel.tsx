import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertTriangle, UserCheck, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSim } from '@/devtools/SimProvider';

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

const PRACTICE_TYPE_OPTIONS = [
  { value: 'pediatric_us', label: 'Pediatric – US' },
  { value: 'general_us', label: 'General – US' },
  { value: 'general_uk', label: 'General – UK' },
];

function formatPracticeType(pt: string) {
  return PRACTICE_TYPE_OPTIONS.find((o) => o.value === pt)?.label ?? pt;
}

interface OrgPanelRow {
  id: string;
  name: string;
  slug: string;
  practice_type: string;
  timezone?: string;
  logo_url?: string | null;
  brand_color?: string | null;
  created_at: string;
  group_count: number;
}

interface OrgStats {
  location_count: number;
  staff_count: number;
}

interface AdminStaff {
  id: string;
  name: string | null;
}

interface OrgDetailPanelProps {
  org: OrgPanelRow | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function OrgDetailPanel({ org, onClose, onRefresh }: OrgDetailPanelProps) {
  const { toast } = useToast();
  const { updateOverrides } = useSim();

  // Setup status
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  // Org stats
  const [stats, setStats] = useState<OrgStats | null>(null);

  // Settings edit form
  const [editName, setEditName] = useState('');
  const [editPracticeType, setEditPracticeType] = useState('');
  const [editTimezone, setEditTimezone] = useState('');
  const [editBrandColor, setEditBrandColor] = useState('');
  const [saving, setSaving] = useState(false);

  // Logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Impersonation
  const [admins, setAdmins] = useState<AdminStaff[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Load panel data when org changes
  useEffect(() => {
    if (!org) return;

    setSetupComplete(null);
    setStats(null);
    setEditName(org.name);
    setEditPracticeType(org.practice_type);
    setEditTimezone(org.timezone ?? 'America/Chicago');
    setEditBrandColor(org.brand_color ?? '#1a4a7a');
    setLogoFile(null);
    setLogoPreview(null);
    setAdmins([]);
    setSelectedAdminId('');

    loadPanelData(org.id);
  }, [org?.id]);

  const loadPanelData = async (orgId: string) => {
    // Setup complete check
    try {
      const { data: setupData } = await (supabase.rpc as any)('is_org_setup_complete', { p_org_id: orgId });
      setSetupComplete(setupData === true);
    } catch { /* RPC may not exist yet */ }

    // Stats: location + staff counts
    const [{ data: groups }, adminsResult] = await Promise.all([
      supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', orgId)
        .eq('active', true),
      loadAdmins(orgId),
    ]);

    const groupIds = (groups ?? []).map((g) => g.id);
    if (groupIds.length > 0) {
      const [{ count: locCount }, { count: staffCount }] = await Promise.all([
        supabase
          .from('locations')
          .select('*', { count: 'exact', head: true })
          .in('group_id', groupIds)
          .eq('active', true),
        (supabase as any)
          .from('staff')
          .select('*', { count: 'exact', head: true })
          .in('primary_location_id', groupIds.length > 0 ? await getLocationIds(groupIds) : [])
          .eq('active', true),
      ]);
      setStats({ location_count: locCount ?? 0, staff_count: staffCount ?? 0 });
    } else {
      setStats({ location_count: 0, staff_count: 0 });
    }
  };

  const getLocationIds = async (groupIds: string[]): Promise<string[]> => {
    const { data } = await supabase
      .from('locations')
      .select('id')
      .in('group_id', groupIds)
      .eq('active', true);
    return (data ?? []).map((l) => l.id);
  };

  const loadAdmins = async (orgId: string): Promise<void> => {
    setLoadingAdmins(true);
    try {
      const { data: groups } = await supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', orgId);
      const groupIds = (groups ?? []).map((g) => g.id);
      if (groupIds.length === 0) return;

      const { data: locs } = await supabase
        .from('locations')
        .select('id')
        .in('group_id', groupIds)
        .eq('active', true);
      const locationIds = (locs ?? []).map((l) => l.id);
      if (locationIds.length === 0) return;

      const { data: staffData } = await (supabase as any)
        .from('staff')
        .select('id, name, is_org_admin, user_capabilities(is_org_admin)')
        .in('primary_location_id', locationIds);

      const orgAdmins = (staffData ?? []).filter((s: any) => {
        const caps = Array.isArray(s.user_capabilities)
          ? s.user_capabilities[0]
          : s.user_capabilities;
        return s.is_org_admin || caps?.is_org_admin;
      });

      setAdmins(orgAdmins.map((s: any) => ({ id: s.id, name: s.name })));
      if (orgAdmins.length > 0) setSelectedAdminId(orgAdmins[0].id);
    } finally {
      setLoadingAdmins(false);
    }
  };

  // ── Save settings ────────────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    if (!org) return;
    setSaving(true);
    try {
      // Upload new logo if selected
      let newLogoUrl = org.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() ?? 'png';
        const path = `${org.slug}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('org-assets')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path);
          newLogoUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from('organizations')
        .update({
          name: editName.trim(),
          practice_type: editPracticeType,
          ...(editTimezone && { timezone: editTimezone }),
          ...(editBrandColor !== '#1a4a7a' && { brand_color: editBrandColor }),
          ...(newLogoUrl !== org.logo_url && { logo_url: newLogoUrl }),
        } as any)
        .eq('id', org.id);

      if (error) throw error;

      toast({ title: 'Saved', description: 'Organization settings updated.' });
      setLogoFile(null);
      setLogoPreview(null);
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Impersonate ──────────────────────────────────────────────────────────────

  const handleImpersonate = () => {
    if (!selectedAdminId) return;
    const admin = admins.find((a) => a.id === selectedAdminId);
    updateOverrides({ enabled: true, masqueradeStaffId: selectedAdminId });
    toast({
      title: 'Simulation active',
      description: `Viewing as ${admin?.name ?? selectedAdminId}`,
    });
  };

  // ── Logo file picker ─────────────────────────────────────────────────────────

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Logo must be under 2 MB.', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  if (!org) return null;

  return (
    <Sheet open={!!org} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {org.name}
            <Badge variant="outline" className="text-xs font-normal">
              {formatPracticeType(org.practice_type)}
            </Badge>
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">{org.slug}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">

          {/* Setup status */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            {setupComplete === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : setupComplete ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium">
                {setupComplete === null
                  ? 'Checking setup…'
                  : setupComplete
                  ? 'Setup complete'
                  : 'Setup incomplete'}
              </p>
              {setupComplete === false && (
                <p className="text-xs text-muted-foreground">
                  Org admin needs to complete the setup wizard (positions + schedule).
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{org.group_count}</p>
                <p className="text-xs text-muted-foreground">Groups</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{stats.location_count}</p>
                <p className="text-xs text-muted-foreground">Locations</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{stats.staff_count}</p>
                <p className="text-xs text-muted-foreground">Staff</p>
              </div>
            </div>
          )}

          <Separator />

          {/* Settings editor */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Settings</h3>

            <div className="space-y-2">
              <Label>Organization name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Sunshine Dental Group"
              />
            </div>

            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={org.slug}
                disabled
                className="font-mono text-sm bg-muted/50 text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
            </div>

            <div className="space-y-2">
              <Label>Practice type</Label>
              <Select value={editPracticeType} onValueChange={setEditPracticeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRACTICE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default timezone</Label>
              <Select value={editTimezone} onValueChange={setEditTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo</Label>
              {logoPreview || org.logo_url ? (
                <div className="flex items-center gap-3">
                  <img
                    src={logoPreview ?? org.logo_url ?? ''}
                    alt="Logo"
                    className="h-9 max-w-[100px] object-contain rounded border bg-muted/30 p-1"
                  />
                  {logoFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              ) : null}
              <label htmlFor="panel-logo-upload" className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {org.logo_url ? 'Replace logo' : 'Upload logo'}
                  </span>
                </Button>
                <input
                  id="panel-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Brand color */}
            <div className="space-y-2">
              <Label>Primary button color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editBrandColor}
                  onChange={(e) => setEditBrandColor(e.target.value)}
                  className="h-9 w-14 rounded border cursor-pointer"
                />
                <span className="font-mono text-sm text-muted-foreground">{editBrandColor}</span>
              </div>
            </div>

            <Button
              onClick={handleSaveSettings}
              disabled={saving || !editName.trim()}
              className="w-full"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </div>

          <Separator />

          {/* Impersonation shortcut */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">View as Org Admin</h3>
            {loadingAdmins ? (
              <p className="text-sm text-muted-foreground">Loading admins…</p>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No org admins found for this organization.</p>
            ) : (
              <div className="flex gap-2">
                <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name ?? a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleImpersonate}
                  disabled={!selectedAdminId}
                  title="Impersonate this admin (browser session only)"
                >
                  <UserCheck className="h-4 w-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Affects your browser session only. No data is modified.
            </p>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
