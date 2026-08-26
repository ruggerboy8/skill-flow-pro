import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// LRM-2: drafts and sends the weekly doctor blast (lead_week_blasts). One
// function, dispatched on `action`. Auth pattern mirrors lead-meeting-summary
// (Bearer token + getClaims). Data-access pattern: every query below runs on
// a service-role client, but is explicitly filtered by the caller's resolved
// staff.id / organization_id -- lead_focus_weeks, lead_meetings and
// lead_week_blasts are all author-scoped RLS tables, and this function needs
// to read across them plus resolve an org-wide recipient cohort, which is
// simplest with one client and explicit filters (the shape coach-remind
// already established for this function family) rather than juggling a
// forwarded-auth client for author-scoped reads and a service-role client for
// the org-wide recipient lookup.
//
// QA fix (fresh-eyes pass on PR #91): being the row's owner was not enough
// authorization -- RLS only checked created_by=self, so any authenticated
// staff row could insert its own draft-blast row and send it to the whole
// org's doctors. Every action below now also requires the same
// training-workspace authority the /training route itself requires (see
// allowTraining in src/components/RequireAccess.tsx): platform admin, or
// can_manage_library within the Alcan org. The migration's RLS policy now
// enforces the same thing for INSERT/UPDATE independently, so this is
// defense in depth, not the only gate.
const ALCAN_ORG_ID = 'a1ca0000-0000-0000-0000-000000000001';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * Resolves the caller's org the same way public.current_user_org_id() does:
 * staff.organization_id, falling back to primary_location_id's practice
 * group's organization_id.
 */
async function resolveOrgId(admin: ReturnType<typeof createClient>, staffRow: { organization_id: string | null; primary_location_id: string | null }): Promise<string | null> {
  if (staffRow.organization_id) return staffRow.organization_id;
  if (!staffRow.primary_location_id) return null;
  const { data: location } = await admin
    .from('locations').select('group_id').eq('id', staffRow.primary_location_id).maybeSingle();
  if (!location?.group_id) return null;
  const { data: group } = await admin
    .from('practice_groups').select('organization_id').eq('id', location.group_id).maybeSingle();
  return group?.organization_id ?? null;
}

/** Server-side equivalent of allowTraining (src/components/RequireAccess.tsx). */
async function hasTrainingAuthority(admin: ReturnType<typeof createClient>, staffId: string, resolvedOrgId: string | null): Promise<boolean> {
  const { data: caps } = await admin
    .from('user_capabilities').select('is_platform_admin, can_manage_library').eq('staff_id', staffId).maybeSingle();
  if (caps?.is_platform_admin) return true;
  return !!caps?.can_manage_library && resolvedOrgId === ALCAN_ORG_ID;
}

function formatWeekLabel(weekStartDate: string): string {
  const [y, m, d] = weekStartDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

interface DoctorRecipient {
  id: string;
  user_id: string;
  name: string;
  email: string;
}

/**
 * Server-side equivalent of src/lib/clinicalDoctorScope.ts's
 * buildOrganizationStaffScopeFilter: staff.organization_id = org OR
 * staff.primary_location_id in (locations under that org's practice_groups),
 * filtered to doctors with a real email on file. Excludes the caller's own
 * staff row -- the blast is addressed to doctors on the team, not back to
 * whoever is sending it, even if that person happens to also be a doctor.
 */
async function resolveDoctorCohort(admin: ReturnType<typeof createClient>, orgId: string, excludeStaffId: string): Promise<DoctorRecipient[]> {
  const { data: groups, error: groupsError } = await admin
    .from('practice_groups').select('id').eq('organization_id', orgId);
  if (groupsError) throw groupsError;
  const groupIds = (groups ?? []).map((g: any) => g.id).filter(Boolean);

  let locationIds: string[] = [];
  if (groupIds.length > 0) {
    const { data: locations, error: locationsError } = await admin
      .from('locations').select('id').in('group_id', groupIds);
    if (locationsError) throw locationsError;
    locationIds = (locations ?? []).map((l: any) => l.id).filter(Boolean);
  }

  const orFilter = locationIds.length > 0
    ? `organization_id.eq.${orgId},primary_location_id.in.(${locationIds.join(',')})`
    : `organization_id.eq.${orgId}`;

  const { data: doctors, error } = await admin
    .from('staff')
    .select('id, user_id, name, email')
    .eq('is_doctor', true)
    .not('email', 'is', null)
    .neq('email', '')
    .neq('id', excludeStaffId)
    .or(orFilter);
  if (error) throw error;
  return (doctors ?? []) as DoctorRecipient[];
}

interface OrgBranding {
  app_display_name?: string | null;
  reply_to_email?: string | null;
}

/** Per-org branding lookup, mirroring coach-remind's organizations.app_display_name / reply_to_email fallback shape. */
async function resolveOrgBranding(admin: ReturnType<typeof createClient>, orgId: string): Promise<OrgBranding> {
  const { data } = await admin
    .from('organizations').select('app_display_name, reply_to_email').eq('id', orgId).maybeSingle();
  return data ?? {};
}

async function handleDraft(admin: ReturnType<typeof createClient>, callerStaff: { id: string }, payload: any) {
  const weekStartDate = payload?.week_start_date;
  if (!weekStartDate || typeof weekStartDate !== 'string') {
    return jsonResponse({ error: 'week_start_date is required' }, 400);
  }

  const { data: focusWeek } = await admin
    .from('lead_focus_weeks')
    .select('id, framing')
    .eq('created_by', callerStaff.id)
    .eq('week_start_date', weekStartDate)
    .eq('status', 'published')
    .maybeSingle();

  let focusItems: { text: string; display_order: number }[] = [];
  if (focusWeek?.id) {
    const { data: items } = await admin
      .from('lead_focus_items')
      .select('text, display_order')
      .eq('week_id', focusWeek.id)
      .order('display_order', { ascending: true });
    focusItems = items ?? [];
  }

  const { data: meetings } = await admin
    .from('lead_meetings')
    .select('raw_transcript')
    .eq('created_by', callerStaff.id)
    .eq('week_start_date', weekStartDate);

  const transcripts = (meetings ?? [])
    .map((m: any) => m.raw_transcript)
    .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0);

  if (focusItems.length === 0 && transcripts.length === 0) {
    return jsonResponse({ error: "This week needs a published focus or a logged meeting before you can draft a blast." }, 400);
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const focusBlock = focusItems.length
    ? focusItems.map((it, i) => `${i + 1}. "${it.text}"`).join('\n')
    : '(no published focus this week -- draft a meeting-only recap instead)';
  const framingLine = focusWeek?.framing ? `\nDirector's framing note for this focus: "${focusWeek.framing}"\n` : '';
  const meetingBlock = transcripts.length
    ? transcripts.map((t, i) => `--- Meeting transcript ${i + 1} ---\n${t}`).join('\n\n')
    : '(no Lead RDA meeting was held this week -- draft a focus-only announcement)';

  const systemPrompt = `# Role
You are a Dental Training Director's assistant, drafting a weekly email from
the director to every doctor in the organization, so doctors know what was
set with their Lead RDAs this week.

# Hard constraints
- Lead with the week's focus items. Quote them VERBATIM, exactly as given in
  the "This week's focus items" section below -- never paraphrase, reword, or
  summarize them. Copy them word for word.
- Never mention a named individual, anyone's performance, or any personnel
  matter of any kind, even if the meeting notes below name someone. If the
  notes reference a person, omit that detail entirely and describe only the
  process-level point being made.
- No em dashes anywhere in the output.
- Do not add a greeting line ("Dear Doctors," or similar) or a signature or
  sign-off ("Best," "Thank you," or similar). Output only the body content.

# What to cover
1. The week's focus items, quoted verbatim, as the lead paragraph or section.
2. Any process-level clarifications or expectations from the meeting notes
   (what was discussed or decided about how things work), if meeting notes
   are provided. If no meeting was held, skip this and keep the email
   focus-only.

# Style
Warm, plain, professional prose in the Alcan voice. A few short paragraphs,
not a bulleted memo. Written to be read by a busy doctor in under a minute.`;

  const userContent = `This week's focus items (quote verbatim):\n${focusBlock}\n${framingLine}\nMeeting notes to summarize at a process level (exclude anything about named individuals):\n${meetingBlock}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[lead-week-blast] OpenAI error:', response.status, errText);
    if (response.status === 429) {
      return jsonResponse({ error: 'Rate limit exceeded, please try again later.' }, 429);
    }
    if (response.status === 402 || response.status === 401) {
      return jsonResponse({ error: 'OpenAI API authentication or billing issue.' }, response.status);
    }
    return jsonResponse({ error: 'Draft generation failed' }, 502);
  }

  const data = await response.json();
  const body = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!body) {
    return jsonResponse({ error: 'No draft produced' }, 502);
  }

  return jsonResponse({ body });
}

async function handleRecipientCount(admin: ReturnType<typeof createClient>, callerStaff: { id: string; organization_id: string }) {
  const doctors = await resolveDoctorCohort(admin, callerStaff.organization_id, callerStaff.id);
  return jsonResponse({ count: doctors.length });
}

async function handleSend(admin: ReturnType<typeof createClient>, callerStaff: { id: string; organization_id: string; user_id: string }, payload: any) {
  const blastId = payload?.blast_id;
  if (!blastId || typeof blastId !== 'string') {
    return jsonResponse({ error: 'blast_id is required' }, 400);
  }

  const { data: blastRow, error: blastError } = await admin
    .from('lead_week_blasts')
    .select('id, created_by, status, body, week_start_date')
    .eq('id', blastId)
    .maybeSingle();
  if (blastError) throw blastError;
  if (!blastRow) {
    return jsonResponse({ error: 'That blast could not be found.' }, 404);
  }
  if (blastRow.created_by !== callerStaff.id) {
    return jsonResponse({ error: 'Unauthorized' }, 403);
  }
  // Belt-and-braces re-check before we even try to claim the row -- the
  // atomic claim below is what actually closes the race, this is just an
  // early, cheap rejection for the common "already sent" case.
  if (blastRow.status === 'sent') {
    return jsonResponse({ error: 'This blast has already been sent.' }, 409);
  }
  if (!blastRow.body || !blastRow.body.trim()) {
    return jsonResponse({ error: 'The blast body is empty. Add some content before sending.' }, 400);
  }

  const doctors = await resolveDoctorCohort(admin, callerStaff.organization_id, callerStaff.id);
  if (doctors.length === 0) {
    return jsonResponse({ error: 'There are no doctors to send this to yet.' }, 400);
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const defaultFromEmail = Deno.env.get('RESEND_FROM') || 'Pro-Moves <no-reply@mypromoves.com>';
  const defaultReplyTo = Deno.env.get('RESEND_REPLY_TO') || 'johno@alcandentalcooperative.com';
  if (!resendApiKey) {
    return jsonResponse({ error: 'Email service not configured' }, 500);
  }

  // Org branding, mirroring coach-remind's per-recipient lookup -- but this
  // blast has exactly one org (the caller's), so it's resolved once instead
  // of once per recipient.
  const branding = await resolveOrgBranding(admin, callerStaff.organization_id);
  const fromDisplayName = branding.app_display_name || 'Pro-Moves';
  const fromEmail = defaultFromEmail.includes('<')
    ? defaultFromEmail.replace(/^[^<]*</, `${fromDisplayName} <`)
    : `${fromDisplayName} <${defaultFromEmail}>`;
  const replyTo = branding.reply_to_email || defaultReplyTo;

  const subject = `This week with your Lead RDAs · ${formatWeekLabel(blastRow.week_start_date)}`;

  // Atomic claim: only proceeds past here if this call is the one that
  // flips status from draft to sent. A concurrent second call (double-click,
  // retry) sees zero rows come back and 409s WITHOUT sending a single email
  // -- this is what actually closes the double-send race, not the earlier
  // status check above (which is just a fast path for the common case).
  const { data: claimedRows, error: claimError } = await admin
    .from('lead_week_blasts')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: callerStaff.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blastId)
    .eq('status', 'draft')
    .select('id');
  if (claimError) throw claimError;
  if (!claimedRows || claimedRows.length === 0) {
    return jsonResponse({ error: 'This blast has already been sent.' }, 409);
  }

  let successCount = 0;
  let failedCount = 0;

  for (const doctor of doctors) {
    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [doctor.email],
          reply_to: replyTo,
          subject,
          text: blastRow.body,
        }),
      });

      if (!resendResponse.ok) {
        const errorData = await resendResponse.json();
        throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
      }

      await admin.from('reminder_log').insert({
        sender_user_id: callerStaff.user_id,
        target_user_id: doctor.user_id,
        type: 'lead_week_blast',
        subject,
        body: blastRow.body,
      });

      successCount++;
      console.log(`[lead-week-blast] sent to ${doctor.email}`);
    } catch (err) {
      failedCount++;
      console.error(`[lead-week-blast] failed to send to ${doctor.email}:`, (err as Error).message);
    }
  }

  // The row is already claimed as 'sent'; this second update just fills in
  // the honest counts once the fan-out is done (partial failures included,
  // never silently rounded up).
  await admin
    .from('lead_week_blasts')
    .update({
      recipient_count: successCount,
      failed_count: failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blastId);

  return jsonResponse({ sent: successCount, failed: failedCount, recipient_count: doctors.length });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const authUserId = claimsData.claims.sub as string;
    if (!authUserId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: staffRow, error: staffError } = await admin
      .from('staff')
      .select('id, organization_id, primary_location_id, user_id')
      .eq('user_id', authUserId)
      .maybeSingle();
    if (staffError || !staffRow?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const orgId = await resolveOrgId(admin, staffRow);
    if (!orgId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const callerStaff = { id: staffRow.id, user_id: staffRow.user_id, organization_id: orgId };

    // Training-workspace authority gate, same for every action below. Being
    // the row's owner is a separate check inside handleSend -- this is
    // "can this person touch the blast pipeline at all".
    if (!(await hasTrainingAuthority(admin, callerStaff.id, orgId))) {
      return jsonResponse({ error: "You don't have access to the doctor blast tool." }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;

    if (action === 'draft') return await handleDraft(admin, callerStaff, payload);
    if (action === 'recipient_count') return await handleRecipientCount(admin, callerStaff);
    if (action === 'send') return await handleSend(admin, callerStaff, payload);

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[lead-week-blast] error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
