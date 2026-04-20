import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { DeputyConnectionCard } from "./integrations/DeputyConnectionCard";
import { DeputyMappingsTable } from "./integrations/DeputyMappingsTable";

export function AdminIntegrationsTab() {
  const { organizationId } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle OAuth callback toast + URL cleanup
  useEffect(() => {
    const deputyParam = searchParams.get("deputy");
    if (!deputyParam) return;

    if (deputyParam === "connected") {
      toast.success("Deputy connected successfully");
    } else if (deputyParam === "error") {
      const reason = searchParams.get("reason") ?? "unknown_error";
      toast.error("Deputy connection failed", { description: reason.replace(/_/g, " ") });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("deputy");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Used here only to gate the mappings table on connection existence
  const { data: connectionExists } = useQuery({
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

  if (!organizationId) {
    return (
      <p className="text-sm text-muted-foreground">
        No organization context — integrations require an organization assignment.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <DeputyConnectionCard organizationId={organizationId} />
      {connectionExists && <DeputyMappingsTable organizationId={organizationId} />}
    </div>
  );
}
