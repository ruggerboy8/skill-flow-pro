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
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('No Authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Client for user authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication - extract token and pass it explicitly
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Admin client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Helper function to calculate week label for a specific timezone
    function getWeekLabelForTimezone(timezone: string): string {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
      });
      
      const parts = formatter.formatToParts(now);
      const month = parseInt(parts.find(p => p.type === 'month')?.value || '1');
      const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
      const year = parseInt(parts.find(p => p.type === 'year')?.value || '2025');
      const weekday = parts.find(p => p.type === 'weekday')?.value || 'Mon';
      
      // Calculate days to Monday (0=Sun, 1=Mon, etc.)
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const currentDay = dayMap[weekday] || 1;
      const daysToMonday = currentDay === 1 ? 0 : (currentDay === 0 ? -6 : 1 - currentDay);
      
      const localDate = new Date(year, month - 1, day);
      localDate.setDate(localDate.getDate() + daysToMonday);
      
      return `Week of ${localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

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
        // Get recipient's location timezone (if they're a staff member)
        let recipientTimezone = 'America/Chicago'; // default
        let weekLabelForRecipient = getWeekLabelForTimezone(recipientTimezone);
        
        if (!recipient.user_id.startsWith('manual-')) {
          const { data: staffData } = await supabase
            .from('staff')
            .select('primary_location_id, locations(timezone)')
            .eq('user_id', recipient.user_id)
            .single();
          
          if (staffData?.locations?.timezone) {
            recipientTimezone = staffData.locations.timezone;
            weekLabelForRecipient = getWeekLabelForTimezone(recipientTimezone);
          }
        }
        
        // Extract first name
        const firstName = recipient.name.split(' ')[0];

        // Replace merge tags
        const personalizedSubject = subject
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, senderStaff.name)
          .replace(/\{\{week_label\}\}/g, weekLabelForRecipient);

        const personalizedBody = body
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{coach_name\}\}/g, senderStaff.name)
          .replace(/\{\{week_label\}\}/g, weekLabelForRecipient);

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
