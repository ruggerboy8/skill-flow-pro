import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Database {
  public: {
    Tables: {
      staff: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string;
          role_id: number | null;
          primary_location_id: string | null;
          is_super_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          email: string;
          role_id?: number | null;
          primary_location_id?: string | null;
          is_super_admin?: boolean;
        };
        Update: {
          name?: string;
          role_id?: number | null;
          primary_location_id?: string | null;
          is_super_admin?: boolean;
        };
      };
      roles: {
        Row: {
          role_id: number;
          role_name: string;
        };
      };
      locations: {
        Row: {
          id: string;
          name: string;
          organization_id: string | null;
        };
      };
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for admin operations
    const supabaseAdmin = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Initialize regular client for RLS operations
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    // Verify caller is superadmin
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: staffRecord } = await supabaseClient
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staffRecord?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    console.log('Request method:', req.method);
    console.log('Path parts:', pathParts);
    console.log('Search params:', url.search);

    // GET / - List users with pagination (root path or just function name)
    if (req.method === 'GET' && (pathParts.length === 0 || pathParts[pathParts.length - 1] === 'admin-users')) {
      const searchParams = new URLSearchParams(url.search);
      const search = searchParams.get('search') || '';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '25');
      const offset = (page - 1) * limit;

      // Get users from auth with staff data
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page: page,
        perPage: limit,
      });

      if (authError) {
        console.error('Auth list error:', authError);
        return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get staff records with role and location info
      const userIds = authUsers.users.map(u => u.id);
      const { data: staffRecords } = await supabaseAdmin
        .from('staff')
        .select(`
          id, user_id, name, email, is_super_admin,
          role_id, roles(role_name),
          primary_location_id, locations(name)
        `)
        .in('user_id', userIds);

      // Combine auth and staff data
      const users = authUsers.users.map(authUser => {
        const staff = staffRecords?.find(s => s.user_id === authUser.id);
        return {
          user_id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
          staff_id: staff?.id || null,
          name: staff?.name || null,
          role_id: staff?.role_id || null,
          role_name: staff?.roles?.role_name || null,
          primary_location_id: staff?.primary_location_id || null,
          location_name: staff?.locations?.name || null,
          is_super_admin: staff?.is_super_admin || false,
        };
      });

      // Apply search filter
      const filteredUsers = search
        ? users.filter(u => 
            (u.name?.toLowerCase().includes(search.toLowerCase())) ||
            (u.email?.toLowerCase().includes(search.toLowerCase()))
          )
        : users;

      return new Response(JSON.stringify({
        users: filteredUsers,
        total: authUsers.total,
        page,
        limit
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle dynamic paths based on body
    const body = req.method !== 'GET' ? await req.json() : {};
    const requestPath = body.path;

    // POST /invite - Invite new user
    if (req.method === 'POST' && (pathParts[0] === 'invite' || requestPath === 'invite')) {
      const { email, name, role_id, location_id, is_super_admin } = body;

      if (!email || !name) {
        return new Response(JSON.stringify({ error: 'Email and name are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // Check if user already exists
        const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(email);
        
        let authUserId: string;

        if (existingUser.user) {
          // User exists, use existing ID
          authUserId = existingUser.user.id;
        } else {
          // Create new auth user
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: false,
          });

          if (createError || !newUser.user) {
            console.error('User creation error:', createError);
            return new Response(JSON.stringify({ error: 'Failed to create user' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          authUserId = newUser.user.id;
        }

        // Create or update staff record
        const { data: staff, error: staffError } = await supabaseAdmin
          .from('staff')
          .upsert({
            user_id: authUserId,
            name,
            email,
            role_id: role_id || null,
            primary_location_id: location_id || null,
            is_super_admin: is_super_admin || false,
          })
          .select()
          .single();

        if (staffError) {
          console.error('Staff creation error:', staffError);
          return new Response(JSON.stringify({ error: 'Failed to create staff record' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Generate setup link for new users
        let setupLink = null;
        if (!existingUser.user) {
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email,
          });

          if (!linkError && linkData.properties?.action_link) {
            setupLink = linkData.properties.action_link;
          }
        }

        return new Response(JSON.stringify({
          user_id: authUserId,
          staff_id: staff.id,
          setup_link: setupLink,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Invite error:', error);
        return new Response(JSON.stringify({ error: 'Failed to invite user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // PATCH /users/:user_id - Update user
    if (req.method === 'PATCH' && pathParts[0] === 'users' && pathParts[1]) {
      const userId = pathParts[1];
      const { name, role_id, primary_location_id, is_super_admin } = body;

      const { data: staff, error: updateError } = await supabaseAdmin
        .from('staff')
        .update({
          name,
          role_id,
          primary_location_id,
          is_super_admin,
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(staff), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /reset-link - Generate password reset link
    if (req.method === 'POST' && (pathParts[0] === 'reset-link' || requestPath === 'reset-link')) {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: 'User ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user email
      const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);

      if (getUserError || !authUser.user?.email) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: authUser.user.email,
      });

      if (linkError || !linkData.properties?.action_link) {
        console.error('Reset link error:', linkError);
        return new Response(JSON.stringify({ error: 'Failed to generate reset link' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        reset_link: linkData.properties.action_link,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /users/:user_id - Delete user
    if (req.method === 'DELETE' && ((pathParts[0] === 'users' && pathParts[1]) || requestPath?.startsWith('users/'))) {
      const userId = pathParts[1] || requestPath?.split('/')[1];

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return new Response(JSON.stringify({ error: 'Failed to delete user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});