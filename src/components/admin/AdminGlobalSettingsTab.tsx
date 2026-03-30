import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Tag, Palette, Mail, Upload, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useUserRole } from "@/hooks/useUserRole";
import type { Json } from "@/integrations/supabase/types";

interface SettingValue {
  enabled: boolean;
}

interface RoleAlias {
  role_id: number;
  role_name: string;
  display_name: string;
}

export function AdminGlobalSettingsTab() {
  const [performanceTimeGateEnabled, setPerformanceTimeGateEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { organizationId } = useUserRole();

  // Role aliases state
  const [roles, setRoles] = useState<RoleAlias[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesSaving, setRolesSaving] = useState(false);

  // Branding state
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState(false);
  const [appDisplayName, setAppDisplayName] = useState('');
  const [emailSignOff, setEmailSignOff] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [brandColor, setBrandColor] = useState('#1a4a7a');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [orgSlug, setOrgSlug] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (organizationId) {
      loadRoleAliases();
      loadBranding();
    }
  }, [organizationId]);

  const loadRoleAliases = async () => {
    if (!organizationId) return;
    setRolesLoading(true);

    // 1. Get org's practice_type
    const { data: org } = await supabase
      .from("organizations")
      .select("practice_type")
      .eq("id", organizationId)
      .single();

    if (!org) {
      setRolesLoading(false);
      return;
    }

    // 2. Fetch roles matching practice_type
    const { data: platformRoles } = await supabase
      .from("roles")
      .select("role_id, role_name, practice_type")
      .eq("practice_type", org.practice_type)
      .eq("active", true)
      .order("role_id");

    // 3. Fetch existing aliases
    const { data: aliases } = await supabase
      .from("organization_role_names")
      .select("role_id, display_name")
      .eq("org_id", organizationId);

    const aliasMap = new Map(
      (aliases || []).map((a) => [a.role_id, a.display_name])
    );

    setRoles(
      (platformRoles || []).map((r) => ({
        role_id: r.role_id,
        role_name: r.role_name || "",
        display_name: aliasMap.get(r.role_id) || "",
      }))
    );
    setRolesLoading(false);
  };

  const loadBranding = async () => {
    if (!organizationId) return;
    setBrandLoading(true);
    try {
      const { data } = await (supabase
        .from('organizations')
        .select('slug, app_display_name, email_sign_off, reply_to_email') as any)
        .eq('id', organizationId)
        .single();
      if (data) {
        setOrgSlug(data.slug || '');
        setAppDisplayName(data.app_display_name || '');
        setEmailSignOff(data.email_sign_off || '');
        setReplyToEmail(data.reply_to_email || '');
        setLogoPreview((data as any).logo_url || null);
        setBrandColor((data as any).brand_color || '#1a4a7a');
      }
    } catch (err) {
      console.error('Error loading branding:', err);
    } finally {
      setBrandLoading(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!organizationId) return;
    setBrandSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() ?? 'png';
        const path = `${orgSlug || organizationId}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('org-assets')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path);
          logoUrl = urlData.publicUrl;
        }
      }

      const payload: Record<string, any> = {
        app_display_name: appDisplayName.trim() || null,
        email_sign_off: emailSignOff.trim() || null,
        reply_to_email: replyToEmail.trim() || null,
        brand_color: brandColor,
      };
      if (logoUrl) payload.logo_url = logoUrl;

      const { error } = await supabase
        .from('organizations')
        .update(payload as any)
        .eq('id', organizationId);
      if (error) throw error;

      setLogoFile(null);
      toast({ title: 'Saved', description: 'Branding settings updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save branding.', variant: 'destructive' });
    } finally {
      setBrandSaving(false);
    }
  };

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

  const handleAliasChange = (roleId: number, value: string) => {
    setRoles((prev) =>
      prev.map((r) =>
        r.role_id === roleId ? { ...r, display_name: value } : r
      )
    );
  };

  const handleSaveAliases = async () => {
    if (!organizationId) return;
    setRolesSaving(true);

    const rows = roles
      .filter((r) => r.display_name.trim() !== "")
      .map((r) => ({
        org_id: organizationId,
        role_id: r.role_id,
        display_name: r.display_name.trim(),
        updated_at: new Date().toISOString(),
      }));

    // Delete any rows where the user cleared the display name
    const clearedRoleIds = roles
      .filter((r) => r.display_name.trim() === "")
      .map((r) => r.role_id);

    let error = null;

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("organization_role_names")
        .upsert(rows, { onConflict: "org_id,role_id" });
      error = upsertError;
    }

    if (!error && clearedRoleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("organization_role_names")
        .delete()
        .eq("org_id", organizationId)
        .in("role_id", clearedRoleIds);
      error = deleteError;
    }

    if (error) {
      console.error("Error saving role aliases:", error);
      toast({
        title: "Error",
        description: "Failed to save role display names.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Saved",
        description: "Role display names updated successfully.",
      });
    }
    setRolesSaving(false);
  };

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("app_kv")
      .select("value")
      .eq("key", "global:performance_time_gate_enabled")
      .maybeSingle();

    if (error) {
      console.error("Error loading settings:", error);
    }

    // Default to enabled if no setting exists
    const value = data?.value as unknown as SettingValue | null;
    setPerformanceTimeGateEnabled(value?.enabled !== false);
    setLoading(false);
  };

  const handleTimeGateToggle = async (enabled: boolean) => {
    setSaving(true);
    setPerformanceTimeGateEnabled(enabled);

    const valuePayload = { enabled } as unknown as Json;

    // Try update first, then insert if no rows affected
    const { error: updateError, count } = await supabase
      .from("app_kv")
      .update({
        value: valuePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("key", "global:performance_time_gate_enabled");

    let error = updateError;
    
    // If no rows were updated, insert
    if (!error && count === 0) {
      const { error: insertError } = await supabase
        .from("app_kv")
        .insert({
          key: "global:performance_time_gate_enabled",
          value: valuePayload,
          updated_at: new Date().toISOString(),
        });
      error = insertError;
    }

    if (error) {
      console.error("Error saving setting:", error);
      toast({
        title: "Error",
        description: "Failed to save setting. Please try again.",
        variant: "destructive",
      });
      // Revert on error
      setPerformanceTimeGateEnabled(!enabled);
    } else {
      toast({
        title: "Setting saved",
        description: enabled
          ? "Performance time gate is now enabled."
          : "Performance time gate is now disabled.",
      });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Submission Timing
          </CardTitle>
          <CardDescription>
            Control when users can submit their scores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="time-gate" className="text-base">
                Performance Time Gate
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, performance scores can only be submitted starting Thursday 00:01
              </p>
            </div>
            <Switch
              id="time-gate"
              checked={performanceTimeGateEnabled}
              onCheckedChange={handleTimeGateToggle}
              disabled={saving}
            />
          </div>

          {!performanceTimeGateEnabled && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Time gate is currently <strong>disabled</strong>. Users can submit performance
                scores immediately after confidence scores. Remember to re-enable after the
                holiday period.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Role Display Names */}
      {organizationId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Role Display Names
            </CardTitle>
            <CardDescription>
              Customize how role titles appear to your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No roles found for your organization's practice type.
              </p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform Role</TableHead>
                      <TableHead>Your Display Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.role_id}>
                        <TableCell className="font-medium">
                          {role.role_name}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={role.display_name}
                            onChange={(e) =>
                              handleAliasChange(role.role_id, e.target.value)
                            }
                            placeholder={role.role_name}
                            className="max-w-xs"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveAliases}
                    disabled={rolesSaving}
                  >
                    {rolesSaving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
