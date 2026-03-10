import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM") || "Pro-Moves <pro-moves@alcandentalcooperative.com>";
    const replyTo = Deno.env.get("RESEND_REPLY_TO") || "johno@alcandentalcooperative.com";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is clinical director or super admin
    const { data: callerStaff } = await admin
      .from("staff")
      .select("id, name, is_clinical_director, is_super_admin, scheduling_link")
      .eq("user_id", user.id)
      .single();

    if (!callerStaff?.is_clinical_director && !callerStaff?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { doctor_staff_id, session_id, scheduling_link, custom_subject, custom_body } = await req.json();
    if (!doctor_staff_id) {
      return new Response(JSON.stringify({ error: "doctor_staff_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get doctor info
    const { data: doctor } = await admin
      .from("staff")
      .select("id, name, email, user_id")
      .eq("id", doctor_staff_id)
      .single();

    if (!doctor) {
      return new Response(JSON.stringify({ error: "Doctor not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use provided scheduling_link, or fall back to caller's stored link
    const link = scheduling_link || callerStaff.scheduling_link;

    // Create or update coaching session
    let sessionData: any;
    if (session_id) {
      // Update existing session
      const { data, error } = await admin
        .from("coaching_sessions")
        .update({ status: "scheduling_invite_sent", updated_at: new Date().toISOString() })
        .eq("id", session_id)
        .select("id")
        .single();
      if (error) throw error;
      sessionData = data;
    } else {
      // Create new session
      const { data: existing } = await admin
        .from("coaching_sessions")
        .select("sequence_number")
        .eq("doctor_staff_id", doctor_staff_id)
        .order("sequence_number", { ascending: false })
        .limit(1);

      const nextSeq = (existing?.[0]?.sequence_number ?? 0) + 1;
      const sessionType = nextSeq === 1 ? "baseline_review" : "followup";

      const { data, error } = await admin
        .from("coaching_sessions")
        .insert({
          doctor_staff_id,
          coach_staff_id: callerStaff.id,
          session_type: sessionType,
          sequence_number: nextSeq,
          status: "scheduling_invite_sent",
          scheduled_at: null,
        })
        .select("id")
        .single();
      if (error) throw error;
      sessionData = data;
    }

    // Send email via Resend
    let emailSent = false;
    if (resendApiKey && doctor.email) {
      const firstName = doctor.name.split(" ")[0];
      const coachName = callerStaff.name;

      // Use custom template if provided, otherwise build default
      let subject: string;
      let body: string;

      if (custom_subject && custom_body) {
        subject = custom_subject
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, coachName)
          .replace(/\{\{doctor_name\}\}/g, doctor.name)
          .replace(/\{\{scheduling_link\}\}/g, link || "[no link provided]");
        body = custom_body
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, coachName)
          .replace(/\{\{doctor_name\}\}/g, doctor.name)
          .replace(/\{\{scheduling_link\}\}/g, link || "[no link provided]");
      } else {
        subject = `${coachName} would like to schedule your coaching session`;
        const bodyParts = [
          `Hi ${firstName},`,
          "",
          `${coachName} has completed their review and is ready to meet with you to discuss your baseline assessment.`,
          "",
        ];
        if (link) {
          bodyParts.push("Please use the link below to schedule a time that works for you:");
          bodyParts.push(link);
          bodyParts.push("");
        } else {
          bodyParts.push(`Please reach out to ${coachName} to find a time that works for your baseline review meeting.`);
          bodyParts.push("");
        }
        bodyParts.push("Looking forward to connecting!");
        bodyParts.push(`— ${coachName}`);
        body = bodyParts.join("\n");
      }

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [doctor.email],
            reply_to: replyTo,
            subject,
            text: body,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
          console.log(`✓ Scheduling invite sent to ${doctor.email}`);
        } else {
          const errData = await resendRes.json();
          console.error("Resend error:", errData);
        }
      } catch (emailErr) {
        console.error("Failed to send email:", emailErr);
      }

      // Log to reminder_log
      try {
        await admin.from("reminder_log").insert({
          sender_user_id: user.id,
          target_user_id: doctor.user_id,
          type: "scheduling_invite",
          subject,
          body,
        });
      } catch (logErr) {
        console.warn("Failed to log reminder:", logErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        session_id: sessionData.id,
        email_sent: emailSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("invite-to-schedule error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
