import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is super admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: staffData } = await supabase
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staffData?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      actionId, 
      audioBase64, 
      voiceName, 
      durationSec, 
      generationId, 
      scriptHash,
      requestId 
    } = await req.json();

    if (!actionId || !audioBase64 || !voiceName || !scriptHash) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Saving audio for action ${actionId}, request_id: ${requestId}`);

    // Check for idempotency: if this requestId was already saved, return existing
    if (requestId) {
      const { data: existing } = await supabase
        .from('pro_move_resources')
        .select('id, url, metadata')
        .eq('action_id', actionId)
        .eq('type', 'audio')
        .eq('status', 'active')
        .eq('metadata->>request_id', requestId)
        .single();

      if (existing) {
        console.log(`Idempotent save detected for request_id ${requestId}, returning existing resource`);
        return new Response(
          JSON.stringify({
            resourceId: existing.id,
            url: existing.url,
            version: existing.metadata.version || 1
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Get next version number
    const { data: versionData } = await supabase
      .from('pro_move_resources')
      .select('metadata')
      .eq('action_id', actionId)
      .eq('type', 'audio')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (versionData?.metadata?.version || 0) + 1;
    const filename = `tts/${actionId}/v${nextVersion}.wav`;

    console.log(`Uploading version ${nextVersion} to ${filename}`);

    // Decode base64 to binary
    const audioBuf = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('pro-move-audio')
      .upload(filename, audioBuf, { 
        contentType: 'audio/wav',
        upsert: true  // Allow overwrite in case of retry after partial failure
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Upload failed', details: uploadError.message }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Start transaction-like operations
    try {
      // Archive all previous active audio for this action
      const { error: archiveError } = await supabase
        .from('pro_move_resources')
        .update({ status: 'archived' })
        .eq('action_id', actionId)
        .eq('type', 'audio')
        .eq('status', 'active');

      if (archiveError) {
        console.error('Archive error:', archiveError);
        // Rollback: delete the uploaded file
        await supabase.storage.from('pro-move-audio').remove([filename]);
        return new Response(
          JSON.stringify({ error: 'Failed to archive previous audio', details: archiveError.message }), 
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Insert new active audio resource
      const { data: inserted, error: insertError } = await supabase
        .from('pro_move_resources')
        .insert({
          action_id: actionId,
          type: 'audio',
          provider: 'hume',
          url: filename,  // Store path, not public URL
          display_order: 2,
          status: 'active',
          title: 'Script audio',
          metadata: {
            voice: voiceName,
            duration_sec: durationSec,
            generation_id: generationId,
            script_sha256: scriptHash,
            created_by: user.id,
            created_at: new Date().toISOString(),
            version: nextVersion,
            ...(requestId ? { request_id: requestId } : {})
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error('DB insert error:', insertError);
        // Rollback: delete the uploaded file and restore archived
        await supabase.storage.from('pro-move-audio').remove([filename]);
        await supabase
          .from('pro_move_resources')
          .update({ status: 'active' })
          .eq('action_id', actionId)
          .eq('type', 'audio')
          .eq('status', 'archived')
          .order('created_at', { ascending: false })
          .limit(1);
        
        return new Response(
          JSON.stringify({ error: 'DB insert failed', details: insertError.message }), 
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(`Audio resource saved: ${inserted.id}, version ${nextVersion}`);

      return new Response(
        JSON.stringify({
          resourceId: inserted.id,
          url: filename,
          version: nextVersion
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } catch (txError: any) {
      // Rollback: delete uploaded file
      console.error('Transaction error:', txError);
      await supabase.storage.from('pro-move-audio').remove([filename]);
      return new Response(
        JSON.stringify({ error: 'Save failed', details: txError.message }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (e: any) {
    console.error('save-audio error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || 'Server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});