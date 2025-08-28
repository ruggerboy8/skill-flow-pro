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

        // Debug: Log the current URL to see what we're working with
        console.log("Auth callback URL:", window.location.href);
        console.log("Hash:", window.location.hash);
        console.log("Search:", window.location.search);

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

        // Handle direct password reset callback (when URL has next=/reset-password but no tokens)
        if (!routed && window.location.search.includes("next=/reset-password")) {
          // Try to exchange the full URL for a session
          try {
            await supabase.auth.exchangeCodeForSession(window.location.href);
            navigate("/reset-password", { replace: true });
            routed = true;
          } catch (exchangeError) {
            console.log("Exchange failed, checking for existing session:", exchangeError);
            // If exchange fails, check if user already has a session
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              navigate("/reset-password", { replace: true });
              routed = true;
            }
          }
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