import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPassword() {
  const nav = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!pw1 || pw1 !== pw2) {
      setErr("Passwords must match.");
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <form onSubmit={onSubmit} className="space-y-3">
            <Input type="password" placeholder="New password" value={pw1} onChange={e => setPw1(e.target.value)} />
            <Input type="password" placeholder="Confirm password" value={pw2} onChange={e => setPw2(e.target.value)} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Update password"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}