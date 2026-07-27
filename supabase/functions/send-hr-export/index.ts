import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Emails a staff offboarding record (a single PDF) to the HR contact.
 * Expects: { pdfBase64: string, filename: string, staffName: string }
 * Admin-only (org admin or super admin). Reuses the Resend setup used by other functions.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM") || "Pro-Moves <no-reply@mypromoves.com>";
    // Phase C U2 (2026-07-24): the HR recipient is resolved per-organization
    // (organizations.hr_email) so a UK leaver's record goes to UK HR, never
    // cross-border. The env var is only a last-resort fallback.
    let hrEmail = Deno.env.get("HR_EXPORT_EMAIL") || "falvarez@alcandentalcooperative.com";

    if (!resendApiKey) return json({ error: "Email is not configured (RESEND_API_KEY missing)" }, 500);

    // Authenticate the caller and confirm they are an admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const anon = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: caller } = await admin
      .from("staff")
      .select("is_org_admin, is_super_admin, organization_id, primary_location_id, locations:primary_location_id(group_id)")
      .eq("user_id", user.id).maybeSingle();
    if (!caller?.is_org_admin && !caller?.is_super_admin) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    // Resolve the caller's org → its HR contact.
    let callerOrgId: string | null = (caller as any)?.organization_id ?? null;
    if (!callerOrgId && (caller as any)?.locations?.group_id) {
      const { data: pg } = await admin
        .from("practice_groups")
        .select("organization_id")
        .eq("id", (caller as any).locations.group_id)
        .single();
      callerOrgId = pg?.organization_id ?? null;
    }
    if (callerOrgId) {
      const { data: org } = await admin
        .from("organizations").select("hr_email").eq("id", callerOrgId).maybeSingle();
      if (org?.hr_email) hrEmail = org.hr_email;
    }

    const { pdfBase64, filename, staffName } = await req.json();
    if (!pdfBase64 || !filename || !staffName) return json({ error: "Missing pdfBase64, filename, or staffName" }, 400);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [hrEmail],
        subject: `Offboarding record — ${staffName}`,
        text: `Attached is the offboarding development record for ${staffName}, generated from Pro-Moves for HR documentation.`,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend send failed:", err);
      return json({ error: "Failed to send email" }, 502);
    }

    return json({ sent: true, to: hrEmail });
  } catch (e) {
    console.error("send-hr-export error:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
