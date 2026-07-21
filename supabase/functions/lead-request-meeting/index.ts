import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Ariyana → lead "let's find time" nudge. Records the in-app request
// (lead_meeting_requests) AND emails the lead with the rationale + booking link.
// Mirrors invite-to-schedule (Resend, org branding, reminder_log).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BOOKING_LINK = "https://calendar.app.google/ariyana-rda";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const defaultFromEmail = Deno.env.get("RESEND_FROM") || "Pro-Moves <no-reply@mypromoves.com>";
    const defaultReplyTo = Deno.env.get("RESEND_REPLY_TO") || "johno@alcandentalcooperative.com";
    const appUrl = Deno.env.get("APP_URL") || "https://mypromoves.com";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Caller must be a super admin (the /training surface is super-admin gated).
    // TODO: generalize to a "training director" capability when access widens.
    const { data: caller } = await admin
      .from("staff")
      .select("id, name, is_super_admin, scheduling_link")
      .eq("user_id", user.id)
      .single();
    if (!caller?.is_super_admin) return json({ error: "Access denied" }, 403);

    const { lead_staff_id, note } = await req.json();
    if (!lead_staff_id) return json({ error: "lead_staff_id required" }, 400);

    const { data: lead } = await admin
      .from("staff")
      .select("id, name, email, user_id, organization_id, primary_location_id")
      .eq("id", lead_staff_id)
      .single();
    if (!lead) return json({ error: "Lead not found" }, 404);

    // Record the in-app request first (this is the notification the lead sees on home).
    const { data: request, error: insErr } = await admin
      .from("lead_meeting_requests")
      .insert({
        organization_id: lead.organization_id,
        created_by: caller.id,
        lead_staff_id: lead.id,
        note: (note ?? "").trim() || null,
        status: "sent",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Org branding for the email envelope.
    let orgBranding: { reply_to_email?: string; app_display_name?: string } = {};
    if (lead.primary_location_id) {
      const { data: loc } = await admin
        .from("locations")
        .select("practice_groups!locations_org_fkey(organizations!practice_groups_organization_id_fkey(reply_to_email, app_display_name))")
        .eq("id", lead.primary_location_id)
        .single();
      const org = (loc as any)?.practice_groups?.organizations;
      if (org) orgBranding = org;
    }
    const fromDisplayName = orgBranding.app_display_name || "Pro-Moves";
    const fromEmail = defaultFromEmail.includes("<")
      ? defaultFromEmail.replace(/^[^<]*</, `${fromDisplayName} <`)
      : `${fromDisplayName} <${defaultFromEmail}>`;
    const replyTo = orgBranding.reply_to_email || defaultReplyTo;

    const link = caller.scheduling_link || DEFAULT_BOOKING_LINK;

    let emailSent = false;
    let subject = "";
    let body = "";
    if (resendApiKey && lead.email) {
      const firstName = (lead.name || "").trim().split(" ")[0] || lead.name;
      const coachName = caller.name;
      const homeUrl = `${appUrl}/`;
      subject = `${coachName} would like to find time with you`;

      const reasonHtml = (note ?? "").trim() ? `<p>${(note as string).trim()}</p>` : "";
      const reasonText = (note ?? "").trim() ? `${(note as string).trim()}\n\n` : "";

      const htmlBody = [
        `<p>Hi ${firstName},</p>`,
        `<p>${coachName} would like to find time to meet with you.</p>`,
        reasonHtml,
        `<p>Please <a href="${link}">pick a time that works for you</a>.</p>`,
        `<p>You can also see this on your <a href="${homeUrl}">Pro Moves home</a>.</p>`,
        `<p>— ${coachName}</p>`,
      ].filter(Boolean).join("\n");

      body = [
        `Hi ${firstName},`,
        "",
        `${coachName} would like to find time to meet with you.`,
        "",
        reasonText + `Pick a time that works for you: ${link}`,
        "",
        `— ${coachName}`,
      ].join("\n");

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromEmail, to: [lead.email], reply_to: replyTo, subject, text: body, html: htmlBody }),
        });
        if (resendRes.ok) {
          emailSent = true;
          console.log(`✓ Meeting nudge emailed to ${lead.email}`);
        } else {
          console.error("Resend error:", await resendRes.json());
        }
      } catch (emailErr) {
        console.error("Failed to send email:", emailErr);
      }

      try {
        await admin.from("reminder_log").insert({
          sender_user_id: user.id,
          target_user_id: lead.user_id,
          type: "lead_meeting_request",
          subject,
          body,
        });
      } catch (logErr) {
        console.warn("Failed to log reminder:", logErr);
      }
    }

    return json({ ok: true, request_id: request.id, email_sent: emailSent });
  } catch (e: any) {
    console.error("lead-request-meeting error:", e);
    return json({ error: e.message }, 500);
  }
});
