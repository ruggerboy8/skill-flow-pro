// supabase/functions/admin-users/index.ts
// Deno deploy target

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth: verify caller is superadmin
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { 
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } 
  });

  const { data: authUser } = await anon.auth.getUser();
  if (!authUser?.user) return json({ error: "Unauthorized" }, 401);

  const { data: me, error: meErr } = await anon.from("staff").select("is_super_admin").eq("user_id", authUser.user.id).maybeSingle();
  if (meErr || !me?.is_super_admin) return json({ error: "Forbidden: Super admin required" }, 403);

  const payload = await safeJson(req);
  const action = payload?.action as string;

  try {
    switch (action) {
      case "list_users": {
        const { page = 1, limit = 20, search = "", location_id, role_id } = payload ?? {};
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let q = supabase
          .from("staff")
          .select("id,name,user_id,role_id,primary_location_id,is_super_admin,roles(role_name),locations(name)", { count: "exact" })
          .order("name", { ascending: true });

        if (search) q = q.ilike("name", `%${search}%`);
        if (location_id) q = q.eq("primary_location_id", location_id);
        if (role_id) q = q.eq("role_id", role_id);

        const { data, count, error } = await q.range(from, to);
        if (error) throw error;

        // join auth.users
        const userIds = (data ?? []).map(d => d.user_id).filter(Boolean);
        const authMap = new Map<string, any>();
        if (userIds.length) {
          const { data: authRes, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (authErr) throw authErr;
          for (const u of authRes.users) authMap.set(u.id, u);
        }

        const rows = (data ?? []).map((s: any) => ({
          staff_id: s.id,
          user_id: s.user_id,
          email: authMap.get(s.user_id)?.email ?? null,
          name: s.name,
          role_id: s.role_id,
          role_name: s.roles?.role_name ?? null,
          location_id: s.primary_location_id,
          location_name: s.locations?.name ?? null,
          is_super_admin: s.is_super_admin ?? false,
        }));

        return json({ rows, total: count ?? rows.length });
      }

      case "invite_user": {
        const { email, name, role_id, location_id, is_super_admin = false } = payload ?? {};
        if (!email || !name || !role_id) return json({ error: "Missing required fields" }, 400);

        // Create staff row first (user_id null until the invite accepts)
        const { data: staff, error: staffErr } = await supabase
          .from("staff")
          .insert({ name, email, role_id, primary_location_id: location_id, is_super_admin })
          .select("id")
          .single();
        if (staffErr) throw staffErr;

        const redirectTo = `${req.headers.get("origin") || "http://localhost:3000"}/auth/callback`;
        const { data: invite, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email, { 
          data: { staff_id: staff.id }, 
          redirectTo 
        });
        if (invErr) throw invErr;

        // Optionally back-fill staff.user_id when invite creates auth user (available in response)
        if (invite?.user?.id) {
          await supabase.from("staff").update({ user_id: invite.user.id }).eq("id", staff.id);
        }

        return json({ ok: true, staff_id: staff.id, user_id: invite?.user?.id ?? null });
      }

      case "update_user": {
        const { user_id, name, role_id, location_id, is_super_admin } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (role_id !== undefined) updateData.role_id = role_id;
        if (location_id !== undefined) updateData.primary_location_id = location_id;
        if (is_super_admin !== undefined) updateData.is_super_admin = is_super_admin;

        const { data: staff, error: stErr } = await supabase
          .from("staff")
          .update(updateData)
          .eq("user_id", user_id)
          .select("id")
          .maybeSingle();
        if (stErr) throw stErr;

        return json({ ok: true, staff_id: staff?.id ?? null });
      }

      case "reset_link": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);
        const { data: link, error: rlErr } = await supabase.auth.admin.generateLink({
          type: "recovery",
          user_id,
          options: {},
        });
        if (rlErr) throw rlErr;
        return json({ ok: true, link: link.properties.action_link });
      }

      case "delete_user": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // 1) delete staff row (FK cleanup happens via CASCADEs already in schema)
        await supabase.from("staff").delete().eq("user_id", user_id);
        // 2) delete auth user
        const { error: delErr } = await supabase.auth.admin.deleteUser(user_id);
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