import { useState } from 'react';
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
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface OrgBootstrapDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function toSlug(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function OrgBootstrapDrawer({ open, onClose, onSuccess }: OrgBootstrapDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showAdminSection, setShowAdminSection] = useState(false);

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [practiceType, setPracticeType] = useState<'pediatric_us' | 'general_us' | 'general_uk'>('general_us');

  // First admin fields
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!slugEdited) setSlug(toSlug(v));
  };

  const handleReset = () => {
    setOrgName('');
    setSlug('');
    setSlugEdited(false);
    setPracticeType('general_us');
    setAdminName('');
    setAdminEmail('');
    setShowAdminSection(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !slug.trim()) return;
    setLoading(true);

    try {
      // 1. Create the organization
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: orgName.trim(), slug: slug.trim(), practice_type: practiceType })
        .select('id')
        .single();
      if (orgErr) throw orgErr;

      // 2. Create an initial practice_group linked to the org
      const groupSlug = toSlug(`${slug}-group`);
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

      // 3. Create a placeholder location under that group
      // Snap program_start_date to next Monday (or today if already Monday)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      const daysUntilMonday = dayOfWeek === 1 ? 0 : ((8 - dayOfWeek) % 7) || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysUntilMonday);
      const startDate = monday.toISOString().split('T')[0];

      const locationSlug = toSlug(orgName.trim());
      const { data: location, error: locErr } = await supabase
        .from('locations')
        .insert({
          name: orgName.trim(),
          slug: locationSlug,
          group_id: group.id,
          active: true,
          timezone: 'America/Chicago',
          program_start_date: startDate,
          cycle_length_weeks: 13,
        })
        .select('id')
        .single();
      if (locErr) throw locErr;

      // 4. Optionally invite the first org admin
      let inviteSent = false;
      const wantsInvite = showAdminSection && adminEmail.trim() && adminName.trim();
      if (wantsInvite) {
        const { data: invData, error: invErr } = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'invite_user',
            email: adminEmail.trim(),
            name: adminName.trim(),
            location_id: location.id,
            is_participant: false,
            capabilities: {
              is_org_admin: true,
              can_manage_users: true,
              can_manage_locations: true,
              can_invite_users: true,
            },
          },
        });
        if (invErr) {
          console.error('Invite error (FunctionsError):', invErr);
          throw invErr;
        }
        // supabase.functions.invoke may return a non-2xx body in `data`
        if (invData?.error) {
          console.error('Invite error (response body):', invData.error);
          throw new Error(invData.error);
        }
        inviteSent = true;
      }

      toast({
        title: 'Organization created',
        description: inviteSent
          ? `${orgName.trim()} is ready. Invite sent to ${adminEmail.trim()}.`
          : `${orgName.trim()} has been bootstrapped. Add staff when ready.`,
      });

      handleReset();
      onSuccess();
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
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
                placeholder="sunshine-dental"
                required
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier — lowercase letters, numbers, hyphens only.
              </p>
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
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="jane@sunshinedental.com"
                  />
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
              disabled={loading || !orgName.trim() || !slug.trim()}
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
