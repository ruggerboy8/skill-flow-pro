import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Sends email notifications to staff when their evaluation is released.
 * Expects: { eval_ids: string[] }
 * Looks up each eval's staff member email/name and sends a notification.
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

    // Verify caller is coach/admin
    const { data: caller } = await supabase
      .from('staff')
      .select('id, is_coach, is_super_admin, is_org_admin')
      .eq('user_id', user.id)
      .single();

    if (!caller || (!caller.is_coach && !caller.is_super_admin && !caller.is_org_admin)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { eval_ids } = await req.json();
    if (!eval_ids || !Array.isArray(eval_ids) || eval_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'eval_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch evals with staff info
    const { data: evals, error: evalErr } = await supabase
      .from('evaluations')
      .select('id, quarter, program_year, type, staff_id, staff!evaluations_staff_id_fkey(name, email)')
      .in('id', eval_ids)
      .eq('is_visible_to_staff', true);

    if (evalErr) throw evalErr;
    if (!evals || evals.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    let sent = 0;
    for (const ev of evals) {
      const staff = ev.staff as any;
      if (!staff?.email) continue;

      const firstName = (staff.name || '').split(' ')[0] || 'Team Member';
      const periodLabel = ev.type === 'Baseline'
        ? 'Baseline'
        : `${ev.quarter || ''} ${ev.program_year}`.trim();

      const subject = `Your ${periodLabel} evaluation is ready for review`;
      const body = `Hi ${firstName},\n\nYour ${periodLabel} evaluation is ready! Log in to review your scores, highlights, and set your focus for the quarter ahead.\n\nhttps://alcanskills.lovable.app\n\n— The ALCAN Team`;

      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [staff.email],
            reply_to: replyTo,
            subject,
            text: body,
          }),
        });

        if (!resendRes.ok) {
          const err = await resendRes.text();
          console.error(`Failed to email ${staff.email}:`, err);
        } else {
          sent++;
          console.log(`✓ Notified ${staff.email} for eval ${ev.id}`);
        }
      } catch (emailErr) {
        console.error(`Email error for ${staff.email}:`, emailErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: evals.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('notify-eval-release error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
