import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// This is a browser redirect callback — no JWT verification, no CORS needed.
// Deputy redirects the user's browser here after they authorize the app.

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';

serve(async (req) => {
  const appUrl = Deno.env.get('APP_URL') || 'https://mypromoves.com';
  const redirectBase = `${appUrl}/settings/integrations`;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // Deputy returned an error
  if (errorParam) {
    console.error('Deputy OAuth error returned:', errorParam);
    return Response.redirect(
      `${redirectBase}?deputy=error&reason=${encodeURIComponent(errorParam)}`,
      302
    );
  }

  if (!code || !state) {
    console.error('Missing code or state in callback');
    return Response.redirect(`${redirectBase}?deputy=error&reason=missing_params`, 302);
  }

  const deputyClientId = Deno.env.get('DEPUTY_CLIENT_ID');
  const deputyClientSecret = Deno.env.get('DEPUTY_CLIENT_SECRET');
  const deputyInstall = Deno.env.get('DEPUTY_INSTALL') || 'd2215826013715';
  const deputyRegion = Deno.env.get('DEPUTY_REGION') || 'na';

  if (!deputyClientId || !deputyClientSecret) {
    console.error('Deputy credentials not configured');
    return Response.redirect(`${redirectBase}?deputy=error&reason=not_configured`, 302);
  }

  try {
    // Decode state → { org_id, staff_id }
    let orgId: string;
    let connectedBy: string | null = null;
    try {
      const stateData = JSON.parse(atob(state));
      orgId = stateData.org_id;
      connectedBy = stateData.staff_id ?? null;
    } catch {
      console.error('Failed to decode state param');
      return Response.redirect(`${redirectBase}?deputy=error&reason=invalid_state`, 302);
    }

    if (!orgId) {
      return Response.redirect(`${redirectBase}?deputy=error&reason=missing_org`, 302);
    }

    // Exchange authorization code for access + refresh tokens
    // Note: initial exchange uses once.deputy.com; renewals use install-specific URL
    const tokenBody = new URLSearchParams({
      client_id: deputyClientId,
      client_secret: deputyClientSecret,
      redirect_uri: CALLBACK_URL,
      grant_type: 'authorization_code',
      code,
      scope: 'longlife_refresh_token',
    });

    const tokenResponse = await fetch('https://once.deputy.com/my/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errText);
      return Response.redirect(`${redirectBase}?deputy=error&reason=token_exchange_failed`, 302);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, endpoint } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('Missing tokens in Deputy response:', JSON.stringify(tokenData));
      return Response.redirect(`${redirectBase}?deputy=error&reason=missing_tokens`, 302);
    }

    // Parse install + region from the endpoint field (e.g. "d2215826013715.na.deputy.com")
    const endpointParts = (endpoint ?? '').split('.');
    const resolvedInstall = endpointParts[0] || deputyInstall;
    const resolvedRegion = endpointParts[1] || deputyRegion;

    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 86400) * 1000).toISOString();

    // Persist to database using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: upsertError } = await supabase
      .from('deputy_connections')
      .upsert(
        {
          organization_id: orgId,
          deputy_install: resolvedInstall,
          deputy_region: resolvedRegion,
          access_token,
          refresh_token,
          token_expires_at: tokenExpiresAt,
          connected_at: new Date().toISOString(),
          connected_by: connectedBy,
          // Reset sync state on reconnect
          last_sync_at: null,
          last_sync_status: null,
          last_sync_error: null,
        },
        { onConflict: 'organization_id' }
      );

    if (upsertError) {
      console.error('Failed to store Deputy tokens:', upsertError);
      return Response.redirect(`${redirectBase}?deputy=error&reason=storage_failed`, 302);
    }

    console.log(`Deputy connected for org ${orgId} (install: ${resolvedInstall}.${resolvedRegion})`);
    return Response.redirect(`${redirectBase}?deputy=connected`, 302);
  } catch (error: any) {
    console.error('Unexpected error in deputy-oauth-callback:', error);
    return Response.redirect(`${redirectBase}?deputy=error&reason=unexpected`, 302);
  }
});
