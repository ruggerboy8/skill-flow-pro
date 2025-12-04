// supabase/functions/admin-users/index.ts
// Deno deploy target
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:3000";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alcanskills.lovable.app";

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
  console.log("Auth check - user:", authUser?.user?.id, "error:", authErr?.message);
  if (authErr || !authUser?.user) {
    console.log("Authentication failed:", authErr?.message || "No user");
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: me, error: meErr } = await caller
    .from("staff")
    .select("is_super_admin, is_org_admin, user_id, name")
    .eq("user_id", authUser.user.id)
    .maybeSingle();

  console.log("Staff check - user_id:", authUser.user.id, "staff data:", me, "error:", meErr?.message);
  
  if (meErr) {
    console.log("Database error checking staff:", meErr.message);
    return json({ error: `Database error: ${meErr.message}` }, 500);
  }
  
  if (!me) {
    console.log("No staff record found for user:", authUser.user.id);
    return json({ error: "No staff record found for this user" }, 403);
  }
  
  // Allow access for super admin OR org admin
  if (!me.is_super_admin && !me.is_org_admin) {
    console.log("User is not an admin:", me);
    return json({ error: "Forbidden: Admin access required" }, 403);
  }

  const payload = await safeJson(req);
  const action = payload?.action as string | undefined;
  console.log("admin-users action:", action);

  try {
    switch (action) {
      case "list_users": {
        const { page = 1, limit = 20, search = "", location_id, role_id, super_admin } = payload ?? {};
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Check if caller is Lead RDA (for scope filtering)
        const { data: callerStaff } = await admin
          .from("staff")
          .select("id, is_lead, is_coach, is_super_admin")
          .eq("user_id", authUser.user.id)
          .maybeSingle();
        
        const callerIsLead = callerStaff?.is_lead ?? false;
        const callerIsCoach = callerStaff?.is_coach ?? false;
        const callerIsSuperAdmin = callerStaff?.is_super_admin ?? false;

        let q = admin
          .from("staff")
          .select("id,name,user_id,role_id,primary_location_id,is_super_admin,is_org_admin,is_coach,is_lead,is_participant,coach_scope_type,coach_scope_id,roles(role_name),locations(name,organization_id)", {
            count: "exact",
          })
          .order("name", { ascending: true });

        // Apply Lead RDA scope filtering using junction table
        if (callerIsLead && !callerIsCoach && !callerIsSuperAdmin && callerStaff) {
          const { data: callerScopes } = await admin
            .from("coach_scopes")
            .select("scope_type, scope_id")
            .eq("staff_id", callerStaff.id);
          
          if (callerScopes && callerScopes.length > 0) {
            const orgScopes = callerScopes.filter((s: any) => s.scope_type === 'org').map((s: any) => s.scope_id);
            const locationScopes = callerScopes.filter((s: any) => s.scope_type === 'location').map((s: any) => s.scope_id);
            
            if (orgScopes.length > 0) {
              q = q.in('locations.organization_id', orgScopes);
            } else if (locationScopes.length > 0) {
              q = q.in('primary_location_id', locationScopes);
            }
          }
        }

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

        // Fetch coach_scopes for all staff
        const staffIds = (data ?? []).map((s: any) => s.id);
        const { data: allScopes } = await admin
          .from("coach_scopes")
          .select("staff_id, scope_type, scope_id")
          .in("staff_id", staffIds);
        
        // Build scope map
        const scopeMap = new Map<string, { scope_type: string, scope_ids: string[] }>();
        if (allScopes) {
          for (const scope of allScopes) {
            if (!scopeMap.has(scope.staff_id)) {
              scopeMap.set(scope.staff_id, { scope_type: scope.scope_type, scope_ids: [] });
            }
            scopeMap.get(scope.staff_id)!.scope_ids.push(scope.scope_id);
          }
        }
        
        const rows = (data ?? []).map((s: any) => {
          const a = s.user_id ? authMap.get(s.user_id) : undefined;
          const scopes = scopeMap.get(s.id);
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
            organization_id: s.locations?.organization_id ?? null,
            is_super_admin: s.is_super_admin ?? false,
            is_org_admin: s.is_org_admin ?? false,
            is_coach: s.is_coach ?? false,
            is_lead: s.is_lead ?? false,
            is_participant: s.is_participant ?? true,
            coach_scopes: scopes || null,
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
        const redirectTo = `${SITE_URL}/auth/callback`;
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
        const { user_id, name, role_id, location_id, is_super_admin, is_coach, is_lead, is_participant, coach_scope_type, coach_scope_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);
        
        // Block role changes - must use role_preset instead
        if (is_super_admin !== undefined || is_coach !== undefined || is_lead !== undefined || 
            is_participant !== undefined || coach_scope_type !== undefined || coach_scope_id !== undefined) {
          return json({ error: "Use action=role_preset for role changes." }, 400);
        }

        // Get current state for audit
        const { data: currentStaff } = await admin
          .from("staff")
          .select("*")
          .eq("user_id", user_id)
          .maybeSingle();

        const updateData: Record<string, any> = {};
        if (name !== undefined) updateData.name = name;
        if (role_id !== undefined) updateData.role_id = role_id;
        if (location_id !== undefined) updateData.primary_location_id = location_id;

        const { data: staff, error: stErr } = await admin
          .from("staff")
          .update(updateData)
          .eq("user_id", user_id)
          .select("id")
          .maybeSingle();
        if (stErr) throw stErr;

        // Write audit log
        if (currentStaff) {
          try {
            const { data: changerStaff } = await admin
              .from("staff")
              .select("id")
              .eq("user_id", authUser.user.id)
              .maybeSingle();
            
            if (changerStaff) {
              await admin.from("admin_audit").insert({
                staff_id: currentStaff.id,
                changed_by: changerStaff.id,
                action: "update_user",
                old_values: {
                  name: currentStaff.name,
                  role_id: currentStaff.role_id,
                  primary_location_id: currentStaff.primary_location_id,
                  is_super_admin: currentStaff.is_super_admin,
                  is_coach: currentStaff.is_coach,
                  is_lead: currentStaff.is_lead,
                  coach_scope_type: currentStaff.coach_scope_type,
                  coach_scope_id: currentStaff.coach_scope_id,
                },
                new_values: updateData,
              });
            }
          } catch (auditErr) {
            console.warn("Failed to write audit log:", auditErr);
          }
        }

        return json({ ok: true, staff_id: staff?.id ?? null });
      }

      case "role_preset": {
        const { user_id, preset, coach_scope_type, coach_scope_ids, hire_date, name, email } = payload ?? {};
        
        if (!user_id || !preset) {
          return json({ error: "user_id and preset required" }, 400);
        }
        
        // Get current staff record
        const { data: currentStaff, error: fetchErr } = await admin
          .from("staff")
          .select("*")
          .eq("user_id", user_id)
          .maybeSingle();
        
        if (fetchErr) throw fetchErr;
        if (!currentStaff) return json({ error: "Staff not found" }, 404);
        
        // Validate scope requirements for lead, coach, coach_participant, and regional_manager
        if ((preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager") && (!coach_scope_type || !coach_scope_ids || !Array.isArray(coach_scope_ids) || coach_scope_ids.length === 0)) {
          return json({ error: "Scope type and at least one scope ID are required for this action." }, 422);
        }
        
        // Validate scope IDs exist
        if (coach_scope_type && coach_scope_ids && Array.isArray(coach_scope_ids) && coach_scope_ids.length > 0) {
          const scopeTable = coach_scope_type === 'org' ? 'organizations' : 'locations';
          const { data: scopeData, error: scopeErr } = await admin
            .from(scopeTable)
            .select("id")
            .in("id", coach_scope_ids);
          
          if (scopeErr || !scopeData || scopeData.length !== coach_scope_ids.length) {
            return json({ error: `Invalid ${coach_scope_type === 'org' ? 'organization' : 'location'} IDs` }, 422);
          }
        }
        
        // Define preset configurations
        const presets: Record<string, any> = {
          participant: {
            is_participant: true,
            is_lead: false,
            is_coach: false,
            is_org_admin: false,
            is_super_admin: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/',
          },
          lead: {
            is_participant: true,
            is_lead: true,
            is_coach: false,
            is_org_admin: false,
            is_super_admin: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/',
          },
          coach: {
            is_participant: false,
            is_lead: false,
            is_coach: true,
            is_org_admin: false,
            is_super_admin: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/coach',
          },
          coach_participant: {
            is_participant: true,
            is_lead: false,
            is_coach: true,
            is_org_admin: false,
            is_super_admin: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/coach',
          },
          regional_manager: {
            is_participant: false,
            is_lead: false,
            is_coach: true,
            is_org_admin: true,
            is_super_admin: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/dashboard',
          },
          super_admin: {
            is_participant: false,
            is_lead: false,
            is_coach: false,
            is_org_admin: false,
            is_super_admin: true,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/coach',
          },
        };
        
        const config = presets[preset];
        if (!config) return json({ error: "Invalid preset" }, 400);
        
        // Side-effects: Clear weekly tasks if becoming non-participant
        let deletedScores = 0;
        let deletedSelections = 0;
        
        if (!config.is_participant && currentStaff.is_participant) {
          console.log(`Clearing weekly tasks for staff ${currentStaff.id} (becoming non-participant)`);
          
          // Delete incomplete weekly_scores
          const { error: scoreErr, count: scoreCount } = await admin
            .from("weekly_scores")
            .delete({ count: 'exact' })
            .eq("staff_id", currentStaff.id)
            .or("confidence_score.is.null,performance_score.is.null");
          
          if (scoreErr) console.warn("Error deleting scores:", scoreErr);
          deletedScores = scoreCount ?? 0;
          
          // Delete all weekly_self_select entries
          const { error: selectErr, count: selectCount } = await admin
            .from("weekly_self_select")
            .delete({ count: 'exact' })
            .eq("user_id", user_id);
          
          if (selectErr) console.warn("Error deleting selections:", selectErr);
          deletedSelections = selectCount ?? 0;
        }
        
        // Update staff record
        const updates = { ...config };
        if (hire_date !== undefined) {
          updates.hire_date = hire_date;
        }
        if (name) {
          updates.name = name;
        }
        if (email) {
          updates.email = email;
        }
        
        // Sync scope to staff table for RPC compatibility (get_coach_roster_summary uses staff.coach_scope_*)
        if ((preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager") && 
            coach_scope_type && coach_scope_ids && coach_scope_ids.length > 0) {
          // Keep scope_type as 'org' or 'location' - must match staff_coach_scope_type_check constraint
          updates.coach_scope_type = coach_scope_type;
          // Store the first scope ID (primary scope for RPCs)
          updates.coach_scope_id = coach_scope_ids[0];
          console.log(`Syncing scope to staff table: type=${updates.coach_scope_type}, id=${updates.coach_scope_id}`);
        }
        
        const { data: updatedStaff, error: updateErr } = await admin
          .from("staff")
          .update(updates)
          .eq("user_id", user_id)
          .select("id")
          .maybeSingle();
        
        if (updateErr) throw updateErr;
        
        // Update auth email if changed
        if (email && email !== currentStaff.email) {
          console.log(`Updating auth email for user ${user_id} to ${email}`);
          const { error: authUpdateErr } = await admin.auth.admin.updateUserById(user_id, { email });
          if (authUpdateErr) {
            console.warn("Failed to update auth email:", authUpdateErr);
            // Don't throw - staff record was updated, just log the auth update failure
          }
        }
        
        // Handle coach_scopes junction table
        if (preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager") {
          // Delete existing scopes
          const { error: deleteErr } = await admin
            .from("coach_scopes")
            .delete()
            .eq("staff_id", currentStaff.id);
          
          if (deleteErr) console.warn("Error deleting old scopes:", deleteErr);
          
          // Insert new scopes
          if (coach_scope_ids && Array.isArray(coach_scope_ids) && coach_scope_ids.length > 0) {
            const scopeInserts = coach_scope_ids.map((scope_id: string) => ({
              staff_id: currentStaff.id,
              scope_type: coach_scope_type,
              scope_id: scope_id,
            }));
            
            const { error: insertErr } = await admin
              .from("coach_scopes")
              .insert(scopeInserts);
            
            if (insertErr) {
              console.error("Error inserting scopes:", insertErr);
              throw new Error("Failed to update coach scopes");
            }
            
            console.log(`✅ Inserted ${coach_scope_ids.length} scopes for staff ${currentStaff.id}`);
          }
        } else {
          // For participant/super_admin, clear any existing scopes
          await admin
            .from("coach_scopes")
            .delete()
            .eq("staff_id", currentStaff.id);
        }
        
        // Enhanced audit log
        try {
          const { data: changerStaff } = await admin
            .from("staff")
            .select("id")
            .eq("user_id", authUser.user.id)
            .maybeSingle();
          
          if (changerStaff) {
            await admin.from("admin_audit").insert({
              staff_id: currentStaff.id,
              changed_by: changerStaff.id,
              action: `role_preset`,
              old_values: {
                preset: preset,
                is_participant: currentStaff.is_participant,
                is_lead: currentStaff.is_lead,
                is_coach: currentStaff.is_coach,
                is_super_admin: currentStaff.is_super_admin,
                coach_scope_type: currentStaff.coach_scope_type,
                coach_scope_id: currentStaff.coach_scope_id,
                home_route: currentStaff.home_route,
              },
              new_values: {
                preset: preset,
                ...config
              },
            });
          }
        } catch (auditErr) {
          console.warn("Failed to write audit log:", auditErr);
        }
        
        return json({ 
          ok: true, 
          staff_id: updatedStaff?.id ?? null,
          applied_preset: preset,
          side_effects: {
            cleared_weekly_tasks: !config.is_participant && currentStaff.is_participant,
            deleted_scores: deletedScores,
            deleted_selections: deletedSelections,
          }
        });
      }

      case "reset_link": {
        const { user_id, email: emailIn } = payload ?? {};
        let email = emailIn?.trim();

        if (!email) {
          if (!user_id) return json({ error: "user_id or email required" }, 400);
          const { data: ures, error: getErr } = await admin.auth.admin.getUserById(user_id);
          if (getErr) throw getErr;
          email = ures.user?.email ?? "";
        }
        if (!email) return json({ error: "User has no email" }, 400);

        // IMPORTANT: redirect to the code-entry page (no magic link handling needed)
        const redirectTo = `${SITE_URL}/reset-password`;

        const publicClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
        const { error: resetErr } = await publicClient.auth.resetPasswordForEmail(email, { redirectTo });
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