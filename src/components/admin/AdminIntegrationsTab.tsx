import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plug, Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeputyWizard } from "./integrations/DeputyWizard";

export function AdminIntegrationsTab() {
  const { organizationId } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);

  // Handle OAuth callback toast + URL cleanup
  useEffect(() => {
    const deputyParam = searchParams.get("deputy");
    if (!deputyParam) return;
    if (deputyParam === "connected") toast.success("Deputy connected successfully");
    else if (deputyParam === "error") {
      const reason = searchParams.get("reason") ?? "unknown_error";
      toast.error("Deputy connection failed", { description: reason.replace(/_/g, " ") });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("deputy");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["deputy-connection-exists", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deputy_connections")
        .select("organization_id")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("deputy-initiate-oauth");
      if (error) throw error;
      if (!data?.url) throw new Error("No authorization URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Failed to start Deputy connection", { description: err?.message });
      setConnecting(false);
    }
  };

  if (!organizationId) {
    return (
      <p className="text-sm text-muted-foreground">
        No organization context — integrations require an organization assignment.
      </p>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!connection) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plug className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Deputy</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your Deputy account to automatically excuse absent staff from Pro Moves submissions.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Connect Deputy
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <DeputyWizard organizationId={organizationId} />;
}
