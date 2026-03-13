// supabase/functions/admin-users/index.ts
// Deno deploy target
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:3000";
const SITE_URL = Deno.env.get("SITE_URL") || Deno.env.get("APP_URL") || "https://alcanskills.lovable.app";

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
    .select("is_super_admin, is_org_admin, is_clinical_director, user_id, name")
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
        const { page = 1, limit = 20, search = "", location_id, role_id, super_admin, organization_id } = payload ?? {};
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
          .select("id,name,user_id,role_id,primary_location_id,is_super_admin,is_org_admin,is_coach,is_lead,is_participant,is_paused,paused_at,pause_reason,coach_scope_type,coach_scope_id,hire_date,allow_backfill_until,is_doctor,is_clinical_director,roles(role_name),locations(name,group_id)", {
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
              // Resolve location IDs from practice group scopes to filter staff directly
              const { data: scopeLocs } = await admin
                .from("locations").select("id").in("group_id", orgScopes);
              const scopeLocIds = (scopeLocs ?? []).map((l: any) => l.id);
              if (scopeLocIds.length > 0) {
                q = q.in("primary_location_id", scopeLocIds);
              } else {
                q = q.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (locationScopes.length > 0) {
              q = q.in('primary_location_id', locationScopes);
            }
          }
        }

        // Org-level scoping: resolve group IDs for the given organization and filter
        if (organization_id) {
          const { data: orgGroups } = await admin
            .from("practice_groups")
            .select("id")
            .eq("organization_id", organization_id);
          const orgGroupIds = (orgGroups ?? []).map((g: any) => g.id);
          if (orgGroupIds.length > 0) {
            q = q.in("locations.group_id", orgGroupIds);
          } else {
            // Org has no groups — return empty result set
            q = q.eq("id", "00000000-0000-0000-0000-000000000000");
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
            organization_id: s.locations?.group_id ?? null,
            is_super_admin: s.is_super_admin ?? false,
            is_org_admin: s.is_org_admin ?? false,
            is_coach: s.is_coach ?? false,
            is_lead: s.is_lead ?? false,
            is_participant: s.is_participant ?? true,
            is_paused: s.is_paused ?? false,
            paused_at: s.paused_at ?? null,
            pause_reason: s.pause_reason ?? null,
            is_doctor: s.is_doctor ?? false,
            is_clinical_director: s.is_clinical_director ?? false,
            coach_scopes: scopes || null,
            hire_date: s.hire_date ?? null,
            allow_backfill_until: s.allow_backfill_until ?? null,
          };
          console.log("Final row data:", row);
          return row;
        });

        return json({ rows, total: count ?? rows.length });
      }

      case "invite_user": {
        const { email, name, role_id, location_id, participation_start_at, is_participant, capabilities } = payload ?? {};

        // Determine participant status — default true for backward compatibility
        const isParticipantUser: boolean = is_participant !== undefined ? Boolean(is_participant) : true;

        if (!email || !name || !location_id) {
          return json({ error: "Missing required fields: email, name, and location_id are all required" }, 400);
        }
        // role_id is required for participants but optional for team members
        if (isParticipantUser && !role_id) {
          return json({ error: "role_id is required for participants" }, 400);
        }

        // Org ownership check: non-super-admin callers can only invite to locations
        // within their own organization. Super admins can invite to any org.
        if (!me.is_super_admin) {
          const { data: callerOrgId, error: orgRpcErr } = await caller.rpc('current_user_org_id');
          if (orgRpcErr) console.error('current_user_org_id RPC failed:', orgRpcErr.message);

          // Resolve the target location's org via practice_groups
          const { data: targetLoc } = await admin
            .from('locations')
            .select('group_id')
            .eq('id', location_id)
            .single();

          let targetOrgId: string | null = null;
          if (targetLoc?.group_id) {
            const { data: targetGroup } = await admin
              .from('practice_groups')
              .select('organization_id')
              .eq('id', targetLoc.group_id)
              .single();
            targetOrgId = targetGroup?.organization_id ?? null;
          }

          if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
            console.error(
              `invite_user: org ownership check failed — caller org=${callerOrgId}, target location org=${targetOrgId}, location_id=${location_id}`,
            );
            return json(
              { error: 'Forbidden: the specified location does not belong to your organization' },
              403,
            );
          }
        }

        // 1) Send invite first to get the user_id (uses the Invite User email template)
        const redirectTo = `${SITE_URL}/auth/callback`;
        const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo
        });
        if (invErr) throw invErr;

        if (!invite?.user?.id) {
          return json({ error: "Failed to create user - no user ID returned" }, 500);
        }

        // 2) Create staff row with the user_id from the invite
        // Office Manager (role_id = 3) gets special flags
        const isOfficeManager = role_id === 3;

        const staffInsert: Record<string, any> = {
          name,
          email,
          primary_location_id: location_id,
          is_participant: isParticipantUser,
          user_id: invite.user.id,
        };
        if (role_id) {
          staffInsert.role_id = role_id;
          staffInsert.is_office_manager = isOfficeManager;
        }
        if (participation_start_at) {
          staffInsert.participation_start_at = participation_start_at;
        }

        const { data: staff, error: staffErr } = await admin
          .from("staff")
          .insert(staffInsert)
          .select("id")
          .single();

        if (staffErr) {
          // If staff creation fails, we should clean up the auth user
          console.error("Staff creation failed, cleaning up auth user:", staffErr);
          await admin.auth.admin.deleteUser(invite.user.id);

          // Return user-friendly error for duplicate email
          if (staffErr.code === "23505" && staffErr.message?.includes("email")) {
            return json({ error: "A user with this email address already exists." }, 409);
          }
          throw staffErr;
        }

        // 3) Insert user_capabilities row
        const capsInsert: Record<string, any> = {
          staff_id: staff.id,
          is_participant: isParticipantUser,
          participation_start_at: participation_start_at || null,
          is_platform_admin: false,
        };

        if (capabilities) {
          // Apply explicit capability flags from the invite dialog.
          // Participants can also hold additional permissions (e.g. Lead RDA who reviews evals).
          capsInsert.can_view_submissions = capabilities.can_view_submissions ?? false;
          capsInsert.can_submit_evals = capabilities.can_submit_evals ?? false;
          capsInsert.can_review_evals = capabilities.can_review_evals ?? false;
          capsInsert.can_invite_users = capabilities.can_invite_users ?? false;
          capsInsert.can_manage_library = capabilities.can_manage_library ?? false;
          capsInsert.can_manage_locations = capabilities.can_manage_locations ?? false;
          capsInsert.can_manage_users = capabilities.can_manage_users ?? false;
          capsInsert.is_org_admin = capabilities.is_org_admin ?? false;

          // Sync is_org_admin to staff table for backward compatibility
          if (capabilities.is_org_admin) {
            await admin.from("staff").update({ is_org_admin: true }).eq("id", staff.id);
          }
        } else {
          // No capabilities sent (legacy call) — default all to false
          capsInsert.can_view_submissions = false;
          capsInsert.can_submit_evals = false;
          capsInsert.can_review_evals = false;
          capsInsert.can_invite_users = false;
          capsInsert.can_manage_library = false;
          capsInsert.can_manage_locations = false;
          capsInsert.can_manage_users = false;
          capsInsert.is_org_admin = false;
        }

        const { error: capsErr } = await admin.from("user_capabilities").insert(capsInsert);
        if (capsErr) {
          // Non-fatal: staff record exists, capabilities can be configured later
          console.warn("Failed to insert user_capabilities row:", capsErr);
        }

        // 4) For Office Managers, create a coach_scope entry for their location
        if (isOfficeManager && staff?.id) {
          const { error: scopeErr } = await admin
            .from("coach_scopes")
            .insert({
              staff_id: staff.id,
              scope_type: 'location',
              scope_id: location_id
            });

          if (scopeErr) {
            console.warn("Failed to create coach_scope for Office Manager:", scopeErr);
          }
        }

        // 5) Update user metadata with staff_id
        await admin.auth.admin.updateUserById(invite.user.id, {
          user_metadata: { staff_id: staff.id }
        });

        return json({ ok: true, staff_id: staff.id, user_id: invite.user.id, email_sent: true });
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
          .select("id, is_office_manager")
          .maybeSingle();
        if (stErr) throw stErr;

        // If location changed for an Office Manager, update their coach_scopes
        if (location_id !== undefined && staff?.is_office_manager) {
          // Delete existing location scopes for this staff
          await admin
            .from("coach_scopes")
            .delete()
            .eq("staff_id", staff.id)
            .eq("scope_type", "location");
          
          // Insert new location scope
          await admin
            .from("coach_scopes")
            .insert({
              staff_id: staff.id,
              scope_type: "location",
              scope_id: location_id
            });
        }

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
        const { user_id, preset, coach_scope_type, coach_scope_ids, hire_date, name, email, allow_backfill, location_id } = payload ?? {};
        
        if (!user_id || !preset) {
          return json({ error: "user_id and preset required" }, 400);
        }
        
        // Only super admins can create other super admins
        if (preset === "super_admin" && !me.is_super_admin) {
          return json({ error: "Only super admins can grant super admin privileges" }, 403);
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
        if ((preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager" || preset === "clinical_director") && (!coach_scope_type || !coach_scope_ids || !Array.isArray(coach_scope_ids) || coach_scope_ids.length === 0)) {
          return json({ error: "Scope type and at least one scope ID are required for this action." }, 422);
        }
        
        // Validate scope IDs exist
        if (coach_scope_type && coach_scope_ids && Array.isArray(coach_scope_ids) && coach_scope_ids.length > 0) {
          const scopeTable = coach_scope_type === 'org' ? 'practice_groups' : 'locations';
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
          doctor: {
            is_participant: false,
            is_lead: false,
            is_coach: false,
            is_org_admin: false,
            is_super_admin: false,
            is_doctor: true,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/doctor',
          },
          clinical_director: {
            is_participant: false,
            is_lead: false,
            is_coach: true,
            is_org_admin: true,
            is_super_admin: false,
            is_clinical_director: true,
            is_doctor: false,
            coach_scope_type: null,
            coach_scope_id: null,
            home_route: '/clinical',
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
        if (location_id !== undefined) {
          updates.primary_location_id = location_id;
        }
        
        // Handle backfill permission toggle
        if (allow_backfill !== undefined) {
          if (allow_backfill) {
            // Enable backfill for 7 days from now
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 7);
            updates.allow_backfill_until = expiryDate.toISOString();
            console.log(`Enabling backfill for user ${user_id} until ${expiryDate.toISOString()}`);
          } else {
            // Disable backfill
            updates.allow_backfill_until = null;
            console.log(`Disabling backfill for user ${user_id}`);
          }
        }
        
        // Sync scope to staff table for RPC compatibility (get_coach_roster_summary uses staff.coach_scope_*)
        if ((preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager" || preset === "clinical_director") && 
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
        if (preset === "lead" || preset === "coach" || preset === "coach_participant" || preset === "regional_manager" || preset === "clinical_director") {
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

        // Upsert user_capabilities — base on preset defaults, then apply any overrides
        // sent by the client (e.g. fine-tuned capability toggles from EditUserDrawer).
        const CAPABILITY_PRESETS: Record<string, Record<string, boolean>> = {
          participant:       { is_participant: true,  can_view_submissions: false, can_submit_evals: false, can_review_evals: false, can_invite_users: false, can_manage_users: false, can_manage_locations: false, can_manage_library: false, is_org_admin: false, is_platform_admin: false },
          lead:              { is_participant: true,  can_view_submissions: true,  can_submit_evals: false, can_review_evals: false, can_invite_users: false, can_manage_users: false, can_manage_locations: false, can_manage_library: false, is_org_admin: false, is_platform_admin: false },
          coach:             { is_participant: false, can_view_submissions: true,  can_submit_evals: true,  can_review_evals: true,  can_invite_users: false, can_manage_users: false, can_manage_locations: false, can_manage_library: false, is_org_admin: false, is_platform_admin: false },
          coach_participant: { is_participant: true,  can_view_submissions: true,  can_submit_evals: true,  can_review_evals: true,  can_invite_users: false, can_manage_users: false, can_manage_locations: false, can_manage_library: false, is_org_admin: false, is_platform_admin: false },
          regional_manager:  { is_participant: false, can_view_submissions: true,  can_submit_evals: true,  can_review_evals: true,  can_invite_users: true,  can_manage_users: true,  can_manage_locations: true,  can_manage_library: false, is_org_admin: true,  is_platform_admin: false },
          super_admin:       { is_participant: false, can_view_submissions: true,  can_submit_evals: true,  can_review_evals: true,  can_invite_users: true,  can_manage_users: true,  can_manage_locations: true,  can_manage_library: true,  is_org_admin: true,  is_platform_admin: true  },
        };

        const capsPreset = CAPABILITY_PRESETS[preset];
        if (capsPreset && updatedStaff?.id) {
          // Client may send fine-tuned overrides; merge on top of the preset
          const capsOverride: Record<string, boolean> = {};
          const clientCaps = payload?.capabilities ?? {};
          const overrideKeys = [
            'can_view_submissions', 'can_submit_evals', 'can_review_evals',
            'can_invite_users', 'can_manage_users', 'can_manage_locations',
            'can_manage_library', 'is_org_admin',
          ];
          for (const k of overrideKeys) {
            if (typeof clientCaps[k] === 'boolean') capsOverride[k] = clientCaps[k];
          }

          const finalCaps = { ...capsPreset, ...capsOverride };

          const { error: capsErr } = await admin
            .from('user_capabilities')
            .upsert({
              staff_id: updatedStaff.id,
              ...finalCaps,
              participation_start_at: payload?.participation_start_at ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'staff_id' });

          if (capsErr) {
            console.warn('user_capabilities upsert failed (non-fatal):', capsErr);
          } else {
            console.log(`✅ user_capabilities upserted for staff ${updatedStaff.id} (preset: ${preset})`);
          }
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

      case "resend_invite": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // Get user's email from auth
        const { data: ures, error: getErr } = await admin.auth.admin.getUserById(user_id);
        if (getErr) throw getErr;
        
        const email = ures.user?.email;
        if (!email) return json({ error: "User has no email" }, 400);

        // Check if user has already confirmed their email
        if (ures.user?.email_confirmed_at) {
          return json({ error: "User has already confirmed their email. Use 'Send reset email' instead." }, 400);
        }

        // Resend invite by calling inviteUserByEmail again
        const redirectTo = `${SITE_URL}/auth/callback`;
        const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo
        });
        if (invErr) throw invErr;

        console.log(`✅ Resent invitation to ${email}`);
        return json({ ok: true, message: `Invitation resent to ${email}` });
      }

      case "pause_user": {
        const { user_id, reason } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // Get current staff record
        const { data: currentStaff, error: fetchErr } = await admin
          .from("staff")
          .select("id, is_paused, name")
          .eq("user_id", user_id)
          .maybeSingle();
        
        if (fetchErr) throw fetchErr;
        if (!currentStaff) return json({ error: "Staff not found" }, 404);

        // Update to paused state
        const { error: updateErr } = await admin
          .from("staff")
          .update({
            is_paused: true,
            paused_at: new Date().toISOString(),
            pause_reason: reason || null,
          })
          .eq("user_id", user_id);
        
        if (updateErr) throw updateErr;

        // Audit log
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
              action: "pause_user",
              old_values: { is_paused: false },
              new_values: { is_paused: true, pause_reason: reason || null },
            });
          }
        } catch (auditErr) {
          console.warn("Failed to write audit log:", auditErr);
        }

        console.log(`✅ Paused user ${currentStaff.name} (staff_id: ${currentStaff.id})`);
        return json({ ok: true, message: `User ${currentStaff.name} has been paused` });
      }

      case "unpause_user": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // Get current staff record
        const { data: currentStaff, error: fetchErr } = await admin
          .from("staff")
          .select("id, is_paused, name, pause_reason")
          .eq("user_id", user_id)
          .maybeSingle();
        
        if (fetchErr) throw fetchErr;
        if (!currentStaff) return json({ error: "Staff not found" }, 404);

        // Update to unpaused state
        const { error: updateErr } = await admin
          .from("staff")
          .update({
            is_paused: false,
            paused_at: null,
            pause_reason: null,
          })
          .eq("user_id", user_id);
        
        if (updateErr) throw updateErr;

        // Audit log
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
              action: "unpause_user",
              old_values: { is_paused: true, pause_reason: currentStaff.pause_reason },
              new_values: { is_paused: false },
            });
          }
        } catch (auditErr) {
          console.warn("Failed to write audit log:", auditErr);
        }

        console.log(`✅ Unpaused user ${currentStaff.name} (staff_id: ${currentStaff.id})`);
        return json({ ok: true, message: `User ${currentStaff.name} has been unpaused` });
      }


      case "invite_doctor": {
        // Only clinical directors or super admins can invite doctors
        if (!me.is_clinical_director && !me.is_super_admin) {
          return json({ error: "Only Clinical Directors can invite doctors" }, 403);
        }
        
        const { email, name, location_id, group_id, organization_id, release_baseline } = payload ?? {};
        const resolvedGroupId = group_id || organization_id;
        if (!email || !name || !resolvedGroupId) {
          return json({ error: "Missing required fields: email, name, and group_id are required" }, 400);
        }

        // 1) Send invite first to get the user_id
        const redirectTo = `${SITE_URL}/auth/callback`;
        const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { user_type: 'doctor' }
        });
        if (invErr) {
          // Check for duplicate email
          if (invErr.message?.includes("already been registered")) {
            return json({ error: "A user with this email address already exists." }, 409);
          }
          throw invErr;
        }

        if (!invite?.user?.id) {
          return json({ error: "Failed to create user - no user ID returned" }, 500);
        }

        // 2) Create staff row with is_doctor = true
        // If release_baseline is truthy, set baseline_released_at now
        const staffInsert: Record<string, any> = { 
          name, 
          email, 
          role_id: 4,  // Doctor role
          primary_location_id: location_id || null,  // null = roaming
          is_participant: false,
          is_doctor: true,
          user_id: invite.user.id,
          home_route: '/doctor',
        };

        if (release_baseline) {
          staffInsert.baseline_released_at = new Date().toISOString();
          staffInsert.baseline_released_by = authUser.user.id;
        }

        const { data: staff, error: staffErr } = await admin
          .from("staff")
          .insert(staffInsert)
          .select("id")
          .single();
        
        if (staffErr) {
          // If staff creation fails, clean up the auth user
          console.error("Staff creation failed, cleaning up auth user:", staffErr);
          await admin.auth.admin.deleteUser(invite.user.id);
          
          if (staffErr.code === "23505" && staffErr.message?.includes("email")) {
            return json({ error: "A user with this email address already exists." }, 409);
          }
          throw staffErr;
        }

        // 3) Insert user_capabilities row for doctor (non-participant, clinical role)
        const { error: docCapsErr } = await admin.from("user_capabilities").insert({
          staff_id: staff.id,
          is_participant: false,
          can_view_submissions: false,
          can_submit_evals: false,
          can_review_evals: false,
          can_invite_users: false,
          can_manage_library: false,
          can_manage_locations: false,
          can_manage_users: false,
          is_org_admin: false,
          is_platform_admin: false,
        });
        if (docCapsErr) {
          console.warn("Failed to insert user_capabilities row for doctor:", docCapsErr);
        }

        // 4) Update user metadata with staff_id
        await admin.auth.admin.updateUserById(invite.user.id, {
          user_metadata: { staff_id: staff.id, user_type: 'doctor' }
        });

        console.log(`✅ Invited doctor ${name} (${email}) - staff_id: ${staff.id}, baseline_released: ${!!release_baseline}`);
        return json({ ok: true, staff_id: staff.id, user_id: invite.user.id, email_sent: true, baseline_released: !!release_baseline });
      }

      case "delete_user": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id required" }, 400);

        // Only super admins can delete users
        if (!me.is_super_admin) {
          return json({ error: "Only super admins can delete users" }, 403);
        }

        // Get staff record
        const { data: staffToDelete, error: fetchErr } = await admin
          .from("staff")
          .select("id")
          .eq("user_id", user_id)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (staffToDelete) {
          const sid = staffToDelete.id;

          const requireDelete = async (label: string, op: PromiseLike<{ error: { message: string } | null }>) => {
            const { error } = await op;
            if (error) throw new Error(`Failed to delete ${label}: ${error.message}`);
          };

          const { data: sessions, error: sessionsErr } = await admin
            .from("coaching_sessions")
            .select("id")
            .or(`coach_staff_id.eq.${sid},doctor_staff_id.eq.${sid}`);
          if (sessionsErr) throw new Error(`Failed to load coaching sessions: ${sessionsErr.message}`);
          const sessionIds = (sessions ?? []).map((s: any) => s.id);

          if (sessionIds.length > 0) {
            await requireDelete(
              "coaching meeting records",
              admin.from("coaching_meeting_records").delete().in("session_id", sessionIds),
            );
            await requireDelete(
              "coaching session selections",
              admin.from("coaching_session_selections").delete().in("session_id", sessionIds),
            );
          }

          await requireDelete(
            "coaching sessions (doctor)",
            admin.from("coaching_sessions").delete().eq("doctor_staff_id", sid),
          );
          await requireDelete(
            "coaching sessions (coach)",
            admin.from("coaching_sessions").delete().eq("coach_staff_id", sid),
          );

          const { data: coachBaselines, error: coachBaselinesErr } = await admin
            .from("coach_baseline_assessments")
            .select("id")
            .or(`coach_staff_id.eq.${sid},doctor_staff_id.eq.${sid}`);
          if (coachBaselinesErr) throw new Error(`Failed to load coach baseline assessments: ${coachBaselinesErr.message}`);
          const cbIds = (coachBaselines ?? []).map((b: any) => b.id);

          if (cbIds.length > 0) {
            await requireDelete(
              "coach baseline items",
              admin.from("coach_baseline_items").delete().in("assessment_id", cbIds),
            );
          }

          await requireDelete(
            "coach baseline assessments (doctor)",
            admin.from("coach_baseline_assessments").delete().eq("doctor_staff_id", sid),
          );
          await requireDelete(
            "coach baseline assessments (coach)",
            admin.from("coach_baseline_assessments").delete().eq("coach_staff_id", sid),
          );

          const { data: doctorBaselines, error: doctorBaselinesErr } = await admin
            .from("doctor_baseline_assessments")
            .select("id")
            .eq("doctor_staff_id", sid);
          if (doctorBaselinesErr) throw new Error(`Failed to load doctor baseline assessments: ${doctorBaselinesErr.message}`);
          const dbIds = (doctorBaselines ?? []).map((b: any) => b.id);

          if (dbIds.length > 0) {
            await requireDelete(
              "doctor baseline items",
              admin.from("doctor_baseline_items").delete().in("assessment_id", dbIds),
            );
          }

          await requireDelete(
            "doctor baseline assessments",
            admin.from("doctor_baseline_assessments").delete().eq("doctor_staff_id", sid),
          );

          const { data: evals, error: evalsErr } = await admin
            .from("evaluations")
            .select("id")
            .or(`staff_id.eq.${sid},evaluator_id.eq.${sid},released_by.eq.${sid}`);
          if (evalsErr) throw new Error(`Failed to load evaluations: ${evalsErr.message}`);
          const evalIds = (evals ?? []).map((e: any) => e.id);

          if (evalIds.length > 0) {
            await requireDelete(
              "evaluation items",
              admin.from("evaluation_items").delete().in("evaluation_id", evalIds),
            );
          }

          await requireDelete(
            "evaluations (staff)",
            admin.from("evaluations").delete().eq("staff_id", sid),
          );
          await requireDelete(
            "evaluations (evaluator)",
            admin.from("evaluations").delete().eq("evaluator_id", sid),
          );
          await requireDelete(
            "evaluations (released_by)",
            admin.from("evaluations").delete().eq("released_by", sid),
          );

          await requireDelete("coach scopes", admin.from("coach_scopes").delete().eq("staff_id", sid));
          await requireDelete("manager priorities", admin.from("manager_priorities").delete().eq("coach_staff_id", sid));
          await requireDelete("excused submissions", admin.from("excused_submissions").delete().eq("staff_id", sid));
          await requireDelete("admin audit (staff)", admin.from("admin_audit").delete().eq("staff_id", sid));
          await requireDelete("admin audit (changed_by)", admin.from("admin_audit").delete().eq("changed_by", sid));
          await requireDelete("resource events", admin.from("resource_events").delete().eq("staff_id", sid));
          await requireDelete("organization role names", admin.from("organization_role_names").delete().eq("updated_by", sid));
          await requireDelete("pro moves", admin.from("pro_moves").delete().eq("retired_by", sid));
          await requireDelete("staff audit", admin.from("staff_audit").delete().eq("staff_id", sid));
          await requireDelete("staff quarter focus", admin.from("staff_quarter_focus").delete().eq("staff_id", sid));
          await requireDelete("user backlog", admin.from("user_backlog_v2").delete().eq("staff_id", sid));
          await requireDelete("user capabilities", admin.from("user_capabilities").delete().eq("staff_id", sid));
          await requireDelete("weekly scores", admin.from("weekly_scores").delete().eq("staff_id", sid));

          const { error: delStaffErr } = await admin
            .from("staff")
            .delete()
            .eq("id", sid);
          if (delStaffErr) throw new Error(`Failed to delete staff: ${delStaffErr.message}`);
        }

        // Clean up tables with direct FK to auth.users (not staff.id)
        // These must be nullified/deleted BEFORE deleting the auth user
        const nullifyOps = [
          admin.from("reminder_log").delete().eq("sender_user_id", user_id),
          admin.from("reminder_log").delete().eq("target_user_id", user_id),
          admin.from("reminder_templates").update({ updated_by: null }).eq("updated_by", user_id),
          admin.from("excused_locations").update({ created_by: null }).eq("created_by", user_id),
          admin.from("excused_submissions").update({ created_by: null }).eq("created_by", user_id),
          admin.from("excused_weeks").update({ created_by: null }).eq("created_by", user_id),
          admin.from("organizations").update({ created_by: null }).eq("created_by", user_id),
          admin.from("alcan_weekly_plan").update({ computed_by: null }).eq("computed_by", user_id),
          admin.from("alcan_weekly_plan").update({ published_by: null }).eq("published_by", user_id),
          admin.from("staff").update({ baseline_released_by: null }).eq("baseline_released_by", user_id),
        ];
        const nullResults = await Promise.all(nullifyOps);
        for (const r of nullResults) {
          if (r.error) console.warn("Nullify warning:", r.error.message);
        }

        // Delete the auth user
        const { error: delAuthErr } = await admin.auth.admin.deleteUser(user_id);
        if (delAuthErr) throw delAuthErr;

        console.log(`✅ Deleted user ${user_id}`);
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