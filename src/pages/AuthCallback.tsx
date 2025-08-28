import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthCallback() {
  const nav = useNavigate();
  const { search } = useLocation();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    (async () => {
      try {
        const code = new URLSearchParams(search).get("code");
        if (!code) {
          setStatus("error");
          return;
        }

        // 1) Exchange code for a session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        // 2) Optional: reconcile staff.user_id on first login (if invite carried staff_id)
        const { data: ures } = await supabase.auth.getUser();
        const user = ures?.user;
        const staffId = user?.user_metadata?.staff_id;
        if (user?.id && staffId) {
          // only fill if missing
          await supabase
            .from("staff")
            .update({ user_id: user.id })
            .eq("id", staffId)
            .is("user_id", null);
        }

        setStatus("done");

        // 3) Route: if superadmin, send to Admin; else normal home
        // (non-blocking check; if it fails, just go home)
        try {
          const { data: me } = await supabase
            .from("staff")
            .select("is_super_admin")
            .eq("user_id", user?.id)
            .maybeSingle();

          if (me?.is_super_admin) {
            nav("/admin?tab=users", { replace: true });
          } else {
            nav("/", { replace: true });
          }
        } catch {
          nav("/", { replace: true });
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [search, nav]);

  if (status === "working") {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-4">
            <div className="text-lg font-medium">Signing you in…</div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-4">
            <div className="text-lg font-medium">We couldn't complete sign in.</div>
            <p className="text-sm text-muted-foreground">
              Your link may have expired. Please request a new invite or reset link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return null;
}