// supabase/functions/admin-users/index.ts
// Deno deploy target
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:3000";

// Fail fast if environment isn't wired
if (!SUPABASE_URL || !SERVICE_ROLE || !SUPABASE_ANON_KEY) {
  console.error("Missing required env: SUPABASE_URL / SERVICE_ROLE / ANON_KEY");
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      },
    });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Admin client (bypasses RLS for admin ops)
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, { auth: { persistSession: false } });

  // Auth-aware client (uses caller's JWT for the superadmin check via RLS)
  const caller = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  // Verify caller
  const { data: authUser, error: authErr } = await caller.auth.getUser();
  if (authErr || !authUser?.user) return json({ error: "Unauthorized" }, 401);

  const { data: me, error: meErr } = await caller
    .from("staff")
    .select("is_super_admin")
    .eq("user_id", authUser.user.id)
    .maybeSingle();

  if (meErr || !me?.is_super_admin) return json({ error: "Forbidden: Super admin required" }, 403);

  const payload = await safeJson(req);
  const action = payload?.action as string | undefined;
  console.log("admin-users action:", action);

  try {
    switch (action) {
      case "list_users": {
        const { page = 1, limit = 20, search = "", location_id, role_id, super_admin } = payload ?? {};
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let q = admin
          .from("staff")
          .select("id,name,user_id,role_id,primary_location_id,is_super_admin,roles(role_name),locations(name)", {
            count: "exact",
          })
          .order("name", { ascending: true });

        if (search) q = q.ilike("name", `%${search}%`);
        if (location_id) q = q.eq("primary_location_id", location_id);
        if (role_id) q = q.eq("role_id", role_id);
        if (super_admin !== undefined) q = q.eq("is_super_admin", super_admin);

        const { data, count, error } = await q.range(from, to);
        if (error) throw error;

        // Pull emails only for the users on this page (faster than listUsers 1000)
        const userIds = Array.from(new Set((data ?? []).map((d: any) => d.user_id).filter(Boolean)));
        console.log("Fetching auth data for user IDs:", userIds);
        
        const authMap = new Map<
          string,
          { email: string|null; email_confirmed_at?: string|null; last_sign_in_at?: string|null; created_at?: string }
        >();
        
        await Promise.all(
          userIds.map(async (uid) => {
            const { data: u, error: guErr } = await admin.auth.admin.getUserById(uid);
            if (guErr) {
              console.warn("getUserById failed", uid, guErr.message);
              authMap.set(uid, { email: null });
            } else {
              const authData = {
                email: u.user?.email ?? null,
                email_confirmed_at: u.user?.email_confirmed_at ?? null,
                last_sign_in_at: (u.user?.last_sign_in_at as string) ?? null,
                created_at: u.user?.created_at,
              };
              console.log(`Auth data for ${uid}:`, authData);
              authMap.set(uid, authData);
            }
          })
        );

        const rows = (data ?? []).map((s: any) => {
          const a = s.user_id ? authMap.get(s.user_id) : undefined;
          const row = {
            staff_id: s.id,
            user_id: s.user_id,
            email: a?.email ?? null,
            email_confirmed_at: a?.email_confirmed_at ?? null,
            last_sign_in_at: a?.last_sign_in_at ?? null,
            created_at: a?.created_at ?? null,
            name: s.name,
            role_id: s.role_id,
            role_name: s.roles?.role_name ?? null,
            location_id: s.primary_location_id,
            location_name: s.locations?.name ?? null,
            is_super_admin: s.is_super_admin ?? false,
          };
          console.log("Final row data:", row);
          return row;
        });

        return json({ rows, total: count ?? rows.length });
      }

      case "invite_user": {
        const { email, name, role_id, location_id, is_super_admin = false } = payload ?? {};
        if (!email || !name || !role_id) return json({ error: "Missing required fields" }, 400);

        // 1) Create staff row
        const { data: staff, error: staffErr } = await admin
          .from("staff")
          .insert({ name, role_id, primary_location_id: location_id, is_super_admin })
          .select("id")
          .single();
        if (staffErr) throw staffErr;

        // 2) Send invite with redirect back to app
        const redirectTo = `${APP_URL}/auth/callback`;
        const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { staff_id: staff.id },
          redirectTo
        });
        if (invErr) throw invErr;

        // 3) Backfill staff.user_id if invite created a user now
        if (invite?.user?.id) {
          await admin.from("staff").update({ user_id: invite.user.id }).eq("id", staff.id);
        }
        return json({ ok: true, staff_id: staff.id, user_id: invite?.user?.id ?? null });
      }

      case "update_user": {
        const { user_id, name, role_id, location_id, is_super_admin } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        const updateData: Record<string, any> = {};
        if (name !== undefined) updateData.name = name;
        if (role_id !== undefined) updateData.role_id = role_id;
        if (location_id !== undefined) updateData.primary_location_id = location_id;
        if (is_super_admin !== undefined) updateData.is_super_admin = is_super_admin;

        const { data: staff, error: stErr } = await admin
          .from("staff")
          .update(updateData)
          .eq("user_id", user_id)
          .select("id")
          .maybeSingle();
        if (stErr) throw stErr;

        return json({ ok: true, staff_id: staff?.id ?? null });
      }

      case "reset_link": {
        // Accept user_id OR email. If only user_id is provided, look up the email first.
        const { user_id, email: emailIn } = payload ?? {};
        let email = emailIn?.trim();

        if (!email) {
          if (!user_id) return json({ error: "user_id or email required" }, 400);
          const { data: ures, error: getErr } = await admin.auth.admin.getUserById(user_id);
          if (getErr) throw getErr;
          email = ures.user?.email ?? "";
        }

        if (!email) return json({ error: "User has no email" }, 400);

        const origin = req.headers.get("origin") || APP_URL;
        const redirectTo = `${origin}/auth/callback?next=/reset-password`;
        
        // Create a regular Supabase client to send the reset email (admin client doesn't have resetPasswordForEmail)
        const publicClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
        const { error: resetErr } = await publicClient.auth.resetPasswordForEmail(email, {
          redirectTo
        });
        
        if (resetErr) throw resetErr;

        return json({ ok: true, message: "Password reset email sent" });
      }

      case "delete_user": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // Delete staff first; FK CASCADEs handle dependents if set up
        await admin.from("staff").delete().eq("user_id", user_id);

        const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
        if (delErr) throw delErr;

        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e: any) {
    console.error("Admin users function error:", e);
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});

async function safeJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}