// src/pages/ResetPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Step = "request" | "verify" | "set";

export default function ResetPassword() {
  const nav = useNavigate();
  const { search } = useLocation();
  const { toast } = useToast();

  const qs = useMemo(() => new URLSearchParams(search), [search]);
  const emailFromQuery = qs.get("email") || "";

  const [step, setStep] = useState<Step>(emailFromQuery ? "verify" : "request");
  const [email, setEmail] = useState(emailFromQuery);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Optional: allow re-send from this page
  const sendCode = async () => {
    if (!email) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    try {
      setSending(true);
      const redirectTo = `${window.location.origin}/reset-password?email=${encodeURIComponent(email)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      toast({ title: "Code sent", description: `We emailed a reset code to ${email}.` });
      setStep("verify");
    } catch (e:any) {
      toast({ title: "Error", description: e.message || "Failed to send code", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (!email || !code) {
      toast({ title: "Email and code required", variant: "destructive" });
      return;
    }
    try {
      setVerifying(true);
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "recovery",
      });
      if (error) throw error;
      // If success, we're authenticated in a recovery session. Now set password.
      setStep("set");
      toast({ title: "Code verified", description: "Please set your new password." });
    } catch (e:any) {
      toast({ title: "Invalid or expired code", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const setNewPassword = async () => {
    if (!password || password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    try {
      setUpdating(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now sign in." });
      nav("/", { replace: true });
    } catch (e:any) {
      toast({ title: "Error", description: e.message || "Failed to update password", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          {step === "request" && (
            <>
              <h1 className="text-xl font-semibold">Reset your password</h1>
              <p className="text-sm text-muted-foreground">Enter your email and we’ll send you a 6-digit code.</p>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button onClick={sendCode} disabled={sending}>
                {sending ? "Sending…" : "Send code"}
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <h1 className="text-xl font-semibold">Enter your code</h1>
              {!emailFromQuery && (
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={verifyCode} disabled={verifying}>
                  {verifying ? "Verifying…" : "Verify code"}
                </Button>
                <Button variant="outline" onClick={sendCode} disabled={sending}>
                  {sending ? "Resending…" : "Resend code"}
                </Button>
              </div>
            </>
          )}

          {step === "set" && (
            <>
              <h1 className="text-xl font-semibold">Set a new password</h1>
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button onClick={setNewPassword} disabled={updating}>
                {updating ? "Saving…" : "Save password"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}