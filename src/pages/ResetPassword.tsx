import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const nav = useNavigate();

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"checking" | "enter-code" | "set-password">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const canVerify = useMemo(() => email && code.length >= 6, [email, code]);
  const canSave = useMemo(() => password.length >= 8 && password === confirm, [password, confirm]);

  // On mount, check if we already have a valid session (from AuthCallback
  // recovery flow). CRITICAL: the session must belong to the account the reset
  // was requested for. If the browser had a pre-existing session for a
  // DIFFERENT account (e.g. an admin clicking a reset link they sent for
  // someone else) and the link's token exchange failed, updateUser() would
  // silently change the wrong account's password (happened 2026-07-24). In
  // that case: drop the session and fall back to the OTP code flow, which
  // establishes a session for the correct account via verifyOtp.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const targetEmail = params.get("email");
      if (
        session &&
        targetEmail &&
        session.user.email?.toLowerCase() !== targetEmail.toLowerCase()
      ) {
        await supabase.auth.signOut();
        toast({
          title: "Signed out for safety",
          description: `This reset link is for ${targetEmail}, but the browser was signed in as ${session.user.email}. Enter the 6-digit code from the email to continue.`,
        });
        setStage("enter-code");
        return;
      }
      if (session) {
        setSessionEmail(session.user.email ?? null);
        setStage("set-password");
      } else {
        // No session → user navigated here manually, show OTP form
        setStage("enter-code");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerifyCode() {
    try {
      setWorking(true);
      const { error } = await supabase.auth.verifyOtp({
        type: "recovery",
        email,
        token: code.trim(),
      });
      if (error) throw error;

      setSessionEmail(email);
      setStage("set-password");
      toast({ title: "Code verified", description: "Please choose a new password." });
    } catch (e: any) {
      toast({
        title: "Invalid or expired code",
        description: e?.message ?? "Please request a new reset email.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  }

  async function handleSetPassword() {
    try {
      setWorking(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({ title: "Password updated", description: "You're all set." });
      nav("/", { replace: true });
    } catch (e: any) {
      toast({
        title: "Couldn't update password",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stage === "checking" && (
            <p className="text-sm text-muted-foreground">Checking session…</p>
          )}

          {stage === "enter-code" && (
            <>
              <label className="text-sm">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <label className="text-sm">6-digit code</label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
              <Button disabled={!canVerify || working} onClick={handleVerifyCode} className="w-full">
                Verify code
              </Button>
            </>
          )}

          {stage === "set-password" && (
            <>
              {sessionEmail && (
                <p className="text-sm text-muted-foreground">
                  Setting a new password for <span className="font-medium text-foreground">{sessionEmail}</span>
                </p>
              )}
              <label className="text-sm">New password (min 8 chars)</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="text-sm">Confirm password</label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button disabled={!canSave || working} onClick={handleSetPassword} className="w-full">
                Set new password
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
