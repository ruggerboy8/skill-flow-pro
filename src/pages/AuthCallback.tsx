// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");

  useEffect(() => {
    (async () => {
      try {
        let routed = false;

        // Hash-based tokens (recovery/invite/magic): #access_token=...&refresh_token=...&type=recovery
        if (window.location.hash && window.location.hash.includes("access_token")) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token") || "";
          const refresh_token = params.get("refresh_token") || "";
          const type = params.get("type") || "";

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;

            window.history.replaceState({}, "", window.location.pathname);

            // Check for next parameter in the URL
            const urlParams = new URLSearchParams(window.location.search);
            const next = urlParams.get("next");

            if (type === "recovery") {
              navigate(next || "/reset-password", { replace: true });
            } else {
              navigate(next || "/", { replace: true });
            }
            routed = true;
          }
        }

        // PKCE/OAuth code flow: ?code=...
        if (!routed && window.location.search.includes("code=")) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          window.history.replaceState({}, "", window.location.pathname);
          navigate("/", { replace: true });
          routed = true;
        }

        if (!routed) setStatus("error");
      } catch (e) {
        console.error("Auth callback error:", e);
        setStatus("error");
      }
    })();
  }, [navigate]);

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

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-2">
          <div className="text-lg font-medium">We couldn’t complete sign in.</div>
          <p className="text-sm text-muted-foreground">
            Your link may have expired. Please request a new invite or reset link.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}