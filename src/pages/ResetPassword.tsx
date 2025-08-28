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
  const [stage, setStage] = useState<"enter-code" | "set-password">("enter-code");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);

  const canVerify = useMemo(() => email && code.length >= 6, [email, code]);
  const canSave = useMemo(() => password.length >= 8 && password === confirm, [password, confirm]);

  async function handleVerifyCode() {
    try {
      setWorking(true);
      const { data, error } = await supabase.auth.verifyOtp({
        type: "recovery",
        email,
        token: code.trim(),
      });
      if (error) throw error;

      // If successful, Supabase sets a session; now move to choose new password.
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
      nav("/", { replace: true }); // or nav("/login", { replace: true })
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