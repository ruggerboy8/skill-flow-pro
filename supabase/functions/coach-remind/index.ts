import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Recipient {
  user_id: string;
  email: string;
  name: string;
}

interface RequestPayload {
  template_key: 'confidence' | 'performance';
  subject: string;
  body: string;
  recipients: Recipient[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get coach/sender info
    const { data: senderStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, is_coach, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (staffError || !senderStaff || (!senderStaff.is_coach && !senderStaff.is_super_admin)) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Coaches only.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const payload: RequestPayload = await req.json();
    const { template_key, subject, body, recipients } = payload;

    if (!template_key || !subject || !body || !recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate current week label (Monday of current week)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    const weekLabel = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // Get Resend config
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM') || 'Pro-Moves <pro-moves@alcandentalcooperative.com>';
    const replyTo = Deno.env.get('RESEND_REPLY_TO') || 'johno@alcandentalcooperative.com';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send emails
    let successCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    for (const recipient of recipients) {
      try {
        // Extract first name
        const firstName = recipient.name.split(' ')[0];

        // Replace merge tags
        const personalizedSubject = subject
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, senderStaff.name)
          .replace(/\{\{week_label\}\}/g, weekLabel);

        const personalizedBody = body
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, senderStaff.name)
          .replace(/\{\{week_label\}\}/g, weekLabel);

        // Send via Resend
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient.email],
            reply_to: replyTo,
            subject: personalizedSubject,
            text: personalizedBody,
          }),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json();
          throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
        }

        // Log to database
        await supabase.from('reminder_log').insert({
          sender_user_id: user.id,
          target_user_id: recipient.user_id,
          type: template_key,
          subject: personalizedSubject,
          body: personalizedBody,
        });

        successCount++;
        results.push({ email: recipient.email, success: true });
        console.log(`✓ Sent to ${recipient.email}`);
      } catch (error: any) {
        failedCount++;
        results.push({ email: recipient.email, success: false, error: error.message });
        console.error(`✗ Failed to send to ${recipient.email}:`, error.message);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        count: successCount,
        failed: failedCount,
        total: recipients.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in coach-remind function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
