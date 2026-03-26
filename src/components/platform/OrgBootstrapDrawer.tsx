import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nextMondayInTimezone } from '@/lib/dateUtils';

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

interface OrgBootstrapDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CreatedOrgResult {
  orgId: string;
  orgName: string;
  locationId: string;
}

function toSlug(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function OrgBootstrapDrawer({ open, onClose, onSuccess }: OrgBootstrapDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showAdminSection, setShowAdminSection] = useState(false);
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [practiceType, setPracticeType] = useState<'pediatric_us' | 'general_us' | 'general_uk'>('general_us');
  const [timezone, setTimezone] = useState('America/Chicago');

  // Branding
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState('#1a4a7a');
  const [showBranding, setShowBranding] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // First admin fields
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminEmailError, setAdminEmailError] = useState('');

  // Post-creation invite retry
  const [createdOrgResult, setCreatedOrgResult] = useState<CreatedOrgResult | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [retryingInvite, setRetryingInvite] = useState(false);

  // ── Slug availability check ────────────────────────────────────────────────

  const checkSlug = async (value: string) => {
    if (value.length < 3) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    const { count } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('slug', value);
    setSlugStatus((count ?? 0) > 0 ? 'taken' : 'available');
  };

  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!slugEdited) {
      const derived = toSlug(v);
      setSlug(derived);
      scheduleSlugCheck(derived);
    }
  };

  const handleSlugChange = (v: string) => {
    setSlug(v);
    setSlugEdited(true);
    scheduleSlugCheck(v);
  };

  const scheduleSlugCheck = (value: string) => {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    setSlugStatus('idle');
    slugDebounceRef.current = setTimeout(() => checkSlug(value), 400);
  };

  // ── Email validation ────────────────────────────────────────────────────────

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true; // empty is fine — invite is optional
    if (!EMAIL_RE.test(email.trim())) {
      setAdminEmailError('Enter a valid email address');
      return false;
    }
    setAdminEmailError('');
    return true;
  };

  // ── Logo handling ───────────────────────────────────────────────────────────

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: 'File too large', description: 'Logo must be under 2 MB.', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setOrgName('');
    setSlug('');
    setSlugEdited(false);
    setSlugStatus('idle');
    setPracticeType('general_us');
    setTimezone('America/Chicago');
    setAdminName('');
    setAdminEmail('');
    setAdminEmailError('');
    setShowAdminSection(false);
    setCreatedOrgResult(null);
    setInviteError(null);
    handleRemoveLogo();
    setBrandColor('#1a4a7a');
    setShowBranding(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // ── Invite helper ────────────────────────────────────────────────────────────

  const sendInvite = async (locationId: string): Promise<void> => {
    const { data: invData, error: invErr } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'invite_user',
        email: adminEmail.trim(),
        name: adminName.trim(),
        location_id: locationId,
        is_participant: false,
        capabilities: {
          is_org_admin: true,
          can_manage_users: true,
          can_manage_locations: true,
          can_invite_users: true,
        },
      },
    });
    if (invErr) throw invErr;
    if (invData?.error) throw new Error(invData.error);
  };

  // ── Retry invite ─────────────────────────────────────────────────────────────

  const handleRetryInvite = async () => {
    if (!createdOrgResult || !validateEmail(adminEmail)) return;
    setRetryingInvite(true);
    setInviteError(null);
    try {
      await sendInvite(createdOrgResult.locationId);
      toast({
        title: 'Invite sent',
        description: `${adminEmail.trim()} will receive a link to set their password.`,
      });
      handleReset();
      onSuccess();
    } catch (err: any) {
      setInviteError(err.message || 'Unknown error');
    } finally {
      setRetryingInvite(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !slug.trim()) return;
    if (slugStatus === 'taken') return;

    // Validate email before submitting if invite section is open
    const wantsInvite = showAdminSection && adminEmail.trim() && adminName.trim();
    if (showAdminSection && adminEmail.trim() && !validateEmail(adminEmail)) {
      setShowAdminSection(true);
      return;
    }

    setLoading(true);

    try {
      // 1. Create the organization
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          name: orgName.trim(),
          slug: slug.trim(),
          practice_type: practiceType,
          brand_color: brandColor !== '#1a4a7a' ? brandColor : null,
        })
        .select('id')
        .single();
      if (orgErr) throw orgErr;

      // 2. Upload logo if provided
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() ?? 'png';
        const path = `${slug.trim()}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('org-assets')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path);
          await supabase
            .from('organizations')
            .update({ logo_url: urlData.publicUrl })
            .eq('id', org.id);
        }
        // Logo upload failure is non-fatal — org is already created
      }

      // 3. Create an initial practice_group linked to the org
      const groupSlug = toSlug(`${slug.trim()}-group`);
      const { data: group, error: groupErr } = await supabase
        .from('practice_groups')
        .insert({
          name: orgName.trim(),
          slug: groupSlug,
          organization_id: org.id,
          active: true,
        })
        .select('id')
        .single();
      if (groupErr) throw groupErr;

      // 4. Create a placeholder location — use timezone-aware Monday calculation
      const startDate = nextMondayInTimezone(timezone);
      const locationSlug = toSlug(orgName.trim());
      const { data: location, error: locErr } = await supabase
        .from('locations')
        .insert({
          name: orgName.trim(),
          slug: locationSlug,
          group_id: group.id,
          active: true,
          timezone,
          program_start_date: startDate,
          cycle_length_weeks: 13,
        })
        .select('id')
        .single();
      if (locErr) throw locErr;

      // Org, group, and location are all created — show success regardless of invite outcome
      toast({
        title: 'Organization created',
        description: `${orgName.trim()} has been bootstrapped with an initial group and location.`,
      });

      // 5. Optionally invite the first org admin
      if (wantsInvite) {
        const result: CreatedOrgResult = {
          orgId: org.id,
          orgName: orgName.trim(),
          locationId: location.id,
        };
        try {
          await sendInvite(location.id);
          toast({
            title: 'Invite sent',
            description: `${adminEmail.trim()} will receive a link to set their password.`,
          });
          handleReset();
          onSuccess();
        } catch (inviteErr: any) {
          console.error('Invite error:', inviteErr);
          // Store the created result so the retry panel can use it
          setCreatedOrgResult(result);
          setInviteError(inviteErr.message || 'Unknown error');
          setLoading(false);
          return; // Don't call onSuccess yet — stay open for retry
        }
      } else {
        handleReset();
        onSuccess();
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create organization',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  // ── If we're in the invite-retry state, show a simplified panel ──────────────

  if (createdOrgResult) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Organization Created</SheetTitle>
            <SheetDescription>
              {createdOrgResult.orgName} was created successfully.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The invite to <strong>{adminEmail}</strong> failed: {inviteError}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="retry-name">Admin name</Label>
                <Input
                  id="retry-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retry-email">Admin email</Label>
                <Input
                  id="retry-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => { setAdminEmail(e.target.value); setAdminEmailError(''); }}
                  onBlur={() => validateEmail(adminEmail)}
                  placeholder="jane@sunshinedental.com"
                />
                {adminEmailError && (
                  <p className="text-xs text-destructive">{adminEmailError}</p>
                )}
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => { handleReset(); onSuccess(); }}
            >
              Skip for now
            </Button>
            <Button
              onClick={handleRetryInvite}
              disabled={retryingInvite || !adminName.trim() || !adminEmail.trim()}
            >
              {retryingInvite && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Invite
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Main creation form ────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Organization</SheetTitle>
          <SheetDescription>
            Creates the org, an initial group and placeholder location. Optionally invites
            the first org admin.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          {/* Org details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name *</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => handleOrgNameChange(e.target.value)}
                placeholder="Sunshine Dental Group"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug *</Label>
              <div className="relative">
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="sunshine-dental"
                  required
                  className={`font-mono text-sm pr-8 ${slugStatus === 'taken' ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {slugStatus === 'checking' && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {slugStatus === 'available' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  {slugStatus === 'taken' && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
              {slugStatus === 'taken' ? (
                <p className="text-xs text-destructive">
                  This slug is already taken — try adding a city or year.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Unique identifier — lowercase letters, numbers, hyphens only.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Practice type *</Label>
              <RadioGroup
                value={practiceType}
                onValueChange={(v) => setPracticeType(v as 'pediatric_us' | 'general_us' | 'general_uk')}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pediatric_us" id="type-pediatric-us" />
                  <Label htmlFor="type-pediatric-us" className="font-normal cursor-pointer">
                    Pediatric – US
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="general_us" id="type-general-us" />
                  <Label htmlFor="type-general-us" className="font-normal cursor-pointer">
                    General – US
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="general_uk" id="type-general-uk" />
                  <Label htmlFor="type-general-uk" className="font-normal cursor-pointer">
                    General – UK
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-timezone">Timezone *</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="org-timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for submission deadlines. Can be adjusted per location later.
              </p>
            </div>
          </div>

          {/* Branding — collapsible */}
          <div className="border rounded-md">
            <button
              type="button"
              onClick={() => setShowBranding((v) => !v)}
              className="w-full flex items-center justify-between p-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors rounded-md"
            >
              <span>Branding (optional)</span>
              {showBranding ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showBranding && (
              <div className="px-3 pb-4 space-y-4 border-t pt-3">
                {/* Logo upload */}
                <div className="space-y-2">
                  <Label>Organization logo</Label>
                  {logoPreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-10 max-w-[120px] object-contain rounded border bg-muted/30 p-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={handleLogoSelect}
                        className="hidden"
                        id="logo-upload"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload logo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG, or SVG — max 2 MB. Replaces the default logo in the header.
                      </p>
                    </div>
                  )}
                </div>

                {/* Brand color */}
                <div className="space-y-2">
                  <Label htmlFor="brand-color">Primary button color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="brand-color"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-9 w-14 rounded border cursor-pointer"
                    />
                    <span className="font-mono text-sm text-muted-foreground">{brandColor}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Applies to buttons and interactive accents throughout the app.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* First admin — collapsible */}
          <div className="border rounded-md">
            <button
              type="button"
              onClick={() => setShowAdminSection((v) => !v)}
              className="w-full flex items-center justify-between p-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors rounded-md"
            >
              <span>Invite first org admin (optional)</span>
              {showAdminSection ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showAdminSection && (
              <div className="px-3 pb-4 space-y-3 border-t pt-3">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Admin name</Label>
                  <Input
                    id="admin-name"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Admin email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => { setAdminEmail(e.target.value); setAdminEmailError(''); }}
                    onBlur={() => validateEmail(adminEmail)}
                    placeholder="jane@sunshinedental.com"
                  />
                  {adminEmailError && (
                    <p className="text-xs text-destructive">{adminEmailError}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !orgName.trim() || !slug.trim() || slugStatus === 'taken' || slugStatus === 'checking'}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Organization
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
