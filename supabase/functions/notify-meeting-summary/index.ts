import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Sends an email to a doctor when their meeting summary is ready for review.
 * Expects: { session_id: string }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is clinical director / coach / admin
    const { data: caller } = await supabase
      .from('staff')
      .select('id, name, is_clinical_director, is_coach, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!caller || (!caller.is_clinical_director && !caller.is_coach && !caller.is_super_admin)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch session + doctor info
    const { data: session, error: sessErr } = await supabase
      .from('coaching_sessions')
      .select('id, doctor_staff_id, sequence_number, staff:doctor_staff_id(name, email, user_id)')
      .eq('id', session_id)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const doctor = session.staff as any;
    if (!doctor?.email) {
      return new Response(JSON.stringify({ error: 'Doctor email not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM') || 'Pro-Moves <pro-moves@alcandentalcooperative.com>';
    const replyTo = Deno.env.get('RESEND_REPLY_TO') || 'johno@alcandentalcooperative.com';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firstName = (doctor.name || '').split(' ')[0] || 'Doctor';
    const coachName = caller.name || 'your clinical director';
    const appUrl = Deno.env.get('APP_URL') || 'https://alcanskills.lovable.app';
    const reviewLink = `${appUrl}/doctor/review-prep/${session_id}`;

    const subject = `Your coaching meeting summary is ready for review`;
    const html = `<p>Hi Dr. ${firstName},</p>
<p>${coachName} has shared the summary from your recent coaching session. Please take a moment to <a href="${reviewLink}">review the key takeaways and action steps</a>.</p>
<p>If everything looks good, confirm it so your action steps are locked in. If something needs adjusting, you can request a revision.</p>
<p>— The ALCAN Team</p>`;

    const text = `Hi Dr. ${firstName},

${coachName} has shared the summary from your recent coaching session. Please take a moment to review the key takeaways and action steps:

${reviewLink}

If everything looks good, confirm it so your action steps are locked in. If something needs adjusting, you can request a revision.

— The ALCAN Team`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [doctor.email],
        reply_to: replyTo,
        subject,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error(`Failed to email ${doctor.email}:`, err);
      return new Response(JSON.stringify({ ok: false, error: 'Email send failed', detail: err }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✓ Notified Dr. ${doctor.name} (${doctor.email}) about meeting summary for session ${session_id}`);

    return new Response(JSON.stringify({ ok: true, email_sent: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('notify-meeting-summary error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
