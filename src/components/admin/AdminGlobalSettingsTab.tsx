import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface SettingValue {
  enabled: boolean;
}

export function AdminGlobalSettingsTab() {
  const [performanceTimeGateEnabled, setPerformanceTimeGateEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

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
    </div>
  );
}
