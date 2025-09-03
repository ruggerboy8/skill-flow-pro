import { supabase } from "@/integrations/supabase/client";

export async function getParticipationStart(): Promise<Date | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("participation_start_at")
    .eq("user_id", uid)
    .maybeSingle();

  return staff?.participation_start_at ? new Date(staff.participation_start_at) : null;
}