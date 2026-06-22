import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffProfile } from "@/hooks/useStaffProfile";
import { getLocationWeekContext, assembleWeek } from "@/lib/locationState";
import { Role } from "./facilitatorData";

// DFI / RDA / OM -> role_id (matches the planner routes in App.tsx)
const ROLE_ID: Record<Role, number> = { DFI: 1, RDA: 2, OM: 3 };

export interface ProMoveResource {
  type: string;
  title: string | null;
  url: string | null;
  contentMd: string | null;
  durationMs: number | null;
}

export interface WeekProMove {
  proMoveId: number | null;
  statement: string;
  domain: string;
  intervention: string | null;
  resources: ProMoveResource[];
  hasResource: boolean;
}

// Returns this week's locked pro moves for a role at the facilitator's location,
// reusing the same assembleWeek logic the participant ThisWeekPanel uses.
export function useFacilitatorWeek(role: Role) {
  const { user } = useAuth();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const locationId = staff?.primary_location_id ?? null;
  const roleId = ROLE_ID[role];

  return useQuery<WeekProMove[]>({
    queryKey: ["facilitator-week", locationId, roleId],
    enabled: !!user && !!locationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ctx = await getLocationWeekContext(locationId!);
      const rows = await assembleWeek({
        userId: user!.id,
        roleId,
        locationId: locationId!,
        cycleNumber: ctx.cycleNumber,
        weekInCycle: ctx.weekInCycle,
      });

      const site = (rows ?? []).filter((r: any) => r.type === "site");

      // Count attached learning resources per pro move (grad-cap affordance).
      const ids = site.map((r: any) => r.pro_move_id).filter((id: any): id is number => !!id);
      // pro_move_resources keys by action_id; only active resources (mirrors ThisWeekPanel).
      const byAction: Record<number, ProMoveResource[]> = {};
      if (ids.length > 0) {
        const { data: res } = await supabase
          .from("pro_move_resources")
          .select("action_id, type, title, url, content_md, duration_ms, display_order")
          .in("action_id", ids)
          .eq("status", "active")
          .order("display_order");
        (res ?? []).forEach((r: any) => {
          // Audio urls are storage paths in the public 'pro-move-audio' bucket; resolve
        // them to playable public URLs (mirrors ProMoveDrawer).
        const url = r.type === "audio" && r.url
          ? supabase.storage.from("pro-move-audio").getPublicUrl(r.url).data.publicUrl
          : r.url;
        (byAction[r.action_id] ??= []).push({
            type: r.type, title: r.title, url,
            contentMd: r.content_md, durationMs: r.duration_ms,
          });
        });
      }

      return site.map((r: any) => {
        const resources = r.pro_move_id ? (byAction[r.pro_move_id] ?? []) : [];
        return {
          proMoveId: r.pro_move_id ?? null,
          statement: r.action_statement ?? "Pro Move",
          domain: r.domain_name ?? "General",
          intervention: r.intervention_text ?? null,
          resources,
          hasResource: resources.length > 0,
        };
      });
    },
  });
}
