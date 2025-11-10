export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          scope_location_id: string | null
          scope_organization_id: string | null
          staff_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          scope_location_id?: string | null
          scope_organization_id?: string | null
          staff_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          scope_location_id?: string | null
          scope_organization_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "admin_audit_scope_location_id_fkey"
            columns: ["scope_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_scope_location_id_fkey"
            columns: ["scope_location_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "admin_audit_scope_organization_id_fkey"
            columns: ["scope_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      alcan_weekly_plan: {
        Row: {
          action_ids: number[]
          computed_at: string
          computed_by: string | null
          created_at: string
          engine_config: Json | null
          id: string
          locked_until: string | null
          logs: Json | null
          published_at: string | null
          published_by: string | null
          role_id: number
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
          week_start: string
        }
        Insert: {
          action_ids: number[]
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          engine_config?: Json | null
          id?: string
          locked_until?: string | null
          logs?: Json | null
          published_at?: string | null
          published_by?: string | null
          role_id: number
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week_start: string
        }
        Update: {
          action_ids?: number[]
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          engine_config?: Json | null
          id?: string
          locked_until?: string | null
          logs?: Json | null
          published_at?: string | null
          published_by?: string | null
          role_id?: number
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      app_kv: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      coach_scopes: {
        Row: {
          created_at: string
          id: string
          scope_id: string
          scope_type: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope_id: string
          scope_type: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope_id?: string
          scope_type?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_scopes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_scopes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      competencies: {
        Row: {
          code: string | null
          competency_id: number
          description: string | null
          domain_id: number | null
          interview_prompt: string | null
          name: string | null
          role_id: number | null
          status: string | null
        }
        Insert: {
          code?: string | null
          competency_id: number
          description?: string | null
          domain_id?: number | null
          interview_prompt?: string | null
          name?: string | null
          role_id?: number | null
          status?: string | null
        }
        Update: {
          code?: string | null
          competency_id?: number
          description?: string | null
          domain_id?: number | null
          interview_prompt?: string | null
          name?: string | null
          role_id?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competencies_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "fk_competencies_domain_id"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "fk_competencies_role_id"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "fk_competencies_role_id"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      domains: {
        Row: {
          color_hex: string | null
          domain_id: number
          domain_name: string | null
        }
        Insert: {
          color_hex?: string | null
          domain_id: number
          domain_name?: string | null
        }
        Update: {
          color_hex?: string | null
          domain_id?: number
          domain_name?: string | null
        }
        Relationships: []
      }
      evaluation_items: {
        Row: {
          competency_description_snapshot: string | null
          competency_id: number
          competency_name_snapshot: string
          domain_id: number | null
          domain_name: string | null
          evaluation_id: string
          interview_prompt_snapshot: string | null
          observer_note: string | null
          observer_score: number | null
          self_note: string | null
          self_score: number | null
        }
        Insert: {
          competency_description_snapshot?: string | null
          competency_id: number
          competency_name_snapshot: string
          domain_id?: number | null
          domain_name?: string | null
          evaluation_id: string
          interview_prompt_snapshot?: string | null
          observer_note?: string | null
          observer_score?: number | null
          self_note?: string | null
          self_score?: number | null
        }
        Update: {
          competency_description_snapshot?: string | null
          competency_id?: number
          competency_name_snapshot?: string
          domain_id?: number | null
          domain_name?: string | null
          evaluation_id?: string
          interview_prompt_snapshot?: string | null
          observer_note?: string | null
          observer_score?: number | null
          self_note?: string | null
          self_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_items_domain_id_fk"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "evaluation_items_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_items_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["evaluation_id"]
          },
        ]
      }
      evaluations: {
        Row: {
          audio_recording_path: string | null
          created_at: string
          evaluator_id: string
          id: string
          location_id: string
          observed_at: string | null
          program_year: number
          quarter: string | null
          role_id: number
          staff_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          audio_recording_path?: string | null
          created_at?: string
          evaluator_id: string
          id?: string
          location_id: string
          observed_at?: string | null
          program_year: number
          quarter?: string | null
          role_id: number
          staff_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          audio_recording_path?: string | null
          created_at?: string
          evaluator_id?: string
          id?: string
          location_id?: string
          observed_at?: string | null
          program_year?: number
          quarter?: string | null
          role_id?: number
          staff_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean | null
          created_at: string
          cycle_length_weeks: number
          id: string
          name: string
          onboarding_active: boolean | null
          organization_id: string
          program_start_date: string
          slug: string
          timezone: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          cycle_length_weeks?: number
          id?: string
          name: string
          onboarding_active?: boolean | null
          organization_id: string
          program_start_date: string
          slug: string
          timezone?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          cycle_length_weeks?: number
          id?: string
          name?: string
          onboarding_active?: boolean | null
          organization_id?: string
          program_start_date?: string
          slug?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_priorities: {
        Row: {
          action_id: number
          coach_staff_id: string
          created_at: string
          id: number
          role_id: number
          updated_at: string
          weight: number
        }
        Insert: {
          action_id: number
          coach_staff_id: string
          created_at?: string
          id?: number
          role_id: number
          updated_at?: string
          weight?: number
        }
        Update: {
          action_id?: number
          coach_staff_id?: string
          created_at?: string
          id?: number
          role_id?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "manager_priorities_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "manager_priorities_coach_staff_id_fkey"
            columns: ["coach_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_priorities_coach_staff_id_fkey"
            columns: ["coach_staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          is_sandbox: boolean | null
          name: string
          slug: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          is_sandbox?: boolean | null
          name: string
          slug: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          is_sandbox?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      pro_moves: {
        Row: {
          action_id: number
          action_statement: string | null
          active: boolean | null
          competency_id: number | null
          date_added: string | null
          description: string | null
          resources_url: string | null
          role_id: number | null
          status: string | null
          steps: string | null
          updated_at: string | null
          updated_by: string | null
          version: string | null
        }
        Insert: {
          action_id?: number
          action_statement?: string | null
          active?: boolean | null
          competency_id?: number | null
          date_added?: string | null
          description?: string | null
          resources_url?: string | null
          role_id?: number | null
          status?: string | null
          steps?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: string | null
        }
        Update: {
          action_id?: number
          action_statement?: string | null
          active?: boolean | null
          competency_id?: number | null
          date_added?: string | null
          description?: string | null
          resources_url?: string | null
          role_id?: number | null
          status?: string | null
          steps?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pro_moves_competency_id"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["competency_id"]
          },
          {
            foreignKeyName: "fk_pro_moves_role_id"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "fk_pro_moves_role_id"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          body: string
          id: string
          sender_user_id: string
          sent_at: string
          subject: string
          target_user_id: string
          type: string
        }
        Insert: {
          body: string
          id?: string
          sender_user_id: string
          sent_at?: string
          subject: string
          target_user_id: string
          type: string
        }
        Update: {
          body?: string
          id?: string
          sender_user_id?: string
          sent_at?: string
          subject?: string
          target_user_id?: string
          type?: string
        }
        Relationships: []
      }
      reminder_templates: {
        Row: {
          body: string
          key: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          role_id: number
          role_name: string | null
        }
        Insert: {
          role_id: number
          role_name?: string | null
        }
        Update: {
          role_id?: number
          role_name?: string | null
        }
        Relationships: []
      }
      sequencer_runs: {
        Row: {
          as_of: string | null
          config: Json | null
          error_message: string | null
          id: string
          lock_at_local: string | null
          logs: string[] | null
          mode: string
          notes: string | null
          org_id: string | null
          picks: Json | null
          rank_version: string | null
          role_id: number
          run_at: string
          success: boolean
          target_week_start: string
          weights: Json | null
        }
        Insert: {
          as_of?: string | null
          config?: Json | null
          error_message?: string | null
          id?: string
          lock_at_local?: string | null
          logs?: string[] | null
          mode: string
          notes?: string | null
          org_id?: string | null
          picks?: Json | null
          rank_version?: string | null
          role_id: number
          run_at?: string
          success: boolean
          target_week_start: string
          weights?: Json | null
        }
        Update: {
          as_of?: string | null
          config?: Json | null
          error_message?: string | null
          id?: string
          lock_at_local?: string | null
          logs?: string[] | null
          mode?: string
          notes?: string | null
          org_id?: string | null
          picks?: Json | null
          rank_version?: string | null
          role_id?: number
          run_at?: string
          success?: boolean
          target_week_start?: string
          weights?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sequencer_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_cycle_state: {
        Row: {
          created_at: string
          cycle_length_weeks: number
          cycle_start_date: string
          id: string
          site_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_length_weeks?: number
          cycle_start_date: string
          id?: string
          site_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_length_weeks?: number
          cycle_start_date?: string
          id?: string
          site_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          coach_scope_id: string | null
          coach_scope_type: string | null
          created_at: string | null
          email: string
          hire_date: string | null
          home_route: string | null
          id: string
          is_coach: boolean
          is_lead: boolean
          is_participant: boolean
          is_super_admin: boolean
          location: string | null
          name: string
          onboarding_weeks: number
          organization: string | null
          participation_start_at: string | null
          primary_location_id: string | null
          role_id: number | null
          roles_updated_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          coach_scope_id?: string | null
          coach_scope_type?: string | null
          created_at?: string | null
          email: string
          hire_date?: string | null
          home_route?: string | null
          id?: string
          is_coach?: boolean
          is_lead?: boolean
          is_participant?: boolean
          is_super_admin?: boolean
          location?: string | null
          name: string
          onboarding_weeks?: number
          organization?: string | null
          participation_start_at?: string | null
          primary_location_id?: string | null
          role_id?: number | null
          roles_updated_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          coach_scope_id?: string | null
          coach_scope_type?: string | null
          created_at?: string | null
          email?: string
          hire_date?: string | null
          home_route?: string | null
          id?: string
          is_coach?: boolean
          is_lead?: boolean
          is_participant?: boolean
          is_super_admin?: boolean
          location?: string | null
          name?: string
          onboarding_weeks?: number
          organization?: string | null
          participation_start_at?: string | null
          primary_location_id?: string | null
          role_id?: number | null
          roles_updated_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      staff_audit: {
        Row: {
          changed_at: string | null
          changed_by: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          staff_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          staff_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_audit_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staging_prompts: {
        Row: {
          competency_id: number
          interview_prompt: string | null
        }
        Insert: {
          competency_id: number
          interview_prompt?: string | null
        }
        Update: {
          competency_id?: number
          interview_prompt?: string | null
        }
        Relationships: []
      }
      user_backlog: {
        Row: {
          added_week_id: string
          created_at: string
          id: string
          pro_move_id: number
          resolved_week_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          added_week_id: string
          created_at?: string
          id?: string
          pro_move_id: number
          resolved_week_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          added_week_id?: string
          created_at?: string
          id?: string
          pro_move_id?: number
          resolved_week_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_backlog_v2: {
        Row: {
          action_id: number
          assigned_on: string
          created_at: string
          id: string
          resolved_on: string | null
          source_cycle: number | null
          source_week: number | null
          staff_id: string
        }
        Insert: {
          action_id: number
          assigned_on?: string
          created_at?: string
          id?: string
          resolved_on?: string | null
          source_cycle?: number | null
          source_week?: number | null
          staff_id: string
        }
        Update: {
          action_id?: number
          assigned_on?: string
          created_at?: string
          id?: string
          resolved_on?: string | null
          source_cycle?: number | null
          source_week?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_backlog_v2_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "user_backlog_v2_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_backlog_v2_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      weekly_focus: {
        Row: {
          action_id: number | null
          competency_id: number | null
          created_at: string | null
          cycle: number
          display_order: number | null
          id: string
          role_id: number | null
          self_select: boolean
          universal: boolean
          week_in_cycle: number
          week_start_date: string | null
        }
        Insert: {
          action_id?: number | null
          competency_id?: number | null
          created_at?: string | null
          cycle: number
          display_order?: number | null
          id?: string
          role_id?: number | null
          self_select?: boolean
          universal?: boolean
          week_in_cycle: number
          week_start_date?: string | null
        }
        Update: {
          action_id?: number | null
          competency_id?: number | null
          created_at?: string | null
          cycle?: number
          display_order?: number | null
          id?: string
          role_id?: number | null
          self_select?: boolean
          universal?: boolean
          week_in_cycle?: number
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_focus_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "weekly_focus_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["competency_id"]
          },
          {
            foreignKeyName: "weekly_focus_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "weekly_focus_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      weekly_plan: {
        Row: {
          action_id: number | null
          competency_id: number | null
          created_at: string
          display_order: number
          generated_by: string
          id: number
          locked_at: string | null
          org_id: string | null
          overridden: boolean
          overridden_at: string | null
          rank_snapshot: Json | null
          rank_version: string | null
          role_id: number
          self_select: boolean
          status: string
          updated_at: string
          updated_by: string | null
          week_start_date: string
        }
        Insert: {
          action_id?: number | null
          competency_id?: number | null
          created_at?: string
          display_order: number
          generated_by?: string
          id?: number
          locked_at?: string | null
          org_id?: string | null
          overridden?: boolean
          overridden_at?: string | null
          rank_snapshot?: Json | null
          rank_version?: string | null
          role_id: number
          self_select?: boolean
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_start_date: string
        }
        Update: {
          action_id?: number | null
          competency_id?: number | null
          created_at?: string
          display_order?: number
          generated_by?: string
          id?: number
          locked_at?: string | null
          org_id?: string | null
          overridden?: boolean
          overridden_at?: string | null
          rank_snapshot?: Json | null
          rank_version?: string | null
          role_id?: number
          self_select?: boolean
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "weekly_plan_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["competency_id"]
          },
          {
            foreignKeyName: "weekly_plan_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "weekly_plan_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      weekly_scores: {
        Row: {
          confidence_date: string | null
          confidence_late: boolean | null
          confidence_score: number | null
          confidence_source: Database["public"]["Enums"]["score_source"]
          created_at: string | null
          entered_by: string
          id: string
          performance_date: string | null
          performance_late: boolean | null
          performance_score: number | null
          performance_source: Database["public"]["Enums"]["score_source"]
          selected_action_id: number | null
          site_action_id: number | null
          staff_id: string | null
          updated_at: string | null
          weekly_focus_id: string | null
        }
        Insert: {
          confidence_date?: string | null
          confidence_late?: boolean | null
          confidence_score?: number | null
          confidence_source?: Database["public"]["Enums"]["score_source"]
          created_at?: string | null
          entered_by?: string
          id?: string
          performance_date?: string | null
          performance_late?: boolean | null
          performance_score?: number | null
          performance_source?: Database["public"]["Enums"]["score_source"]
          selected_action_id?: number | null
          site_action_id?: number | null
          staff_id?: string | null
          updated_at?: string | null
          weekly_focus_id?: string | null
        }
        Update: {
          confidence_date?: string | null
          confidence_late?: boolean | null
          confidence_score?: number | null
          confidence_source?: Database["public"]["Enums"]["score_source"]
          created_at?: string | null
          entered_by?: string
          id?: string
          performance_date?: string | null
          performance_late?: boolean | null
          performance_score?: number | null
          performance_source?: Database["public"]["Enums"]["score_source"]
          selected_action_id?: number | null
          site_action_id?: number | null
          staff_id?: string | null
          updated_at?: string | null
          weekly_focus_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_scores_selected_action_id_fkey"
            columns: ["selected_action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "weekly_scores_site_action_fk"
            columns: ["site_action_id"]
            isOneToOne: false
            referencedRelation: "pro_moves"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "weekly_scores_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      weekly_self_select: {
        Row: {
          created_at: string
          id: string
          selected_pro_move_id: number
          slot_index: number
          source: string
          updated_at: string
          user_id: string
          weekly_focus_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          selected_pro_move_id: number
          slot_index: number
          source?: string
          updated_at?: string
          user_id: string
          weekly_focus_id: string
        }
        Update: {
          created_at?: string
          id?: string
          selected_pro_move_id?: number
          slot_index?: number
          source?: string
          updated_at?: string
          user_id?: string
          weekly_focus_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      action_usage_stats: {
        Row: {
          action_id: number | null
          avg_confidence: number | null
          first_assigned: string | null
          last_assigned: string | null
          role_id: number | null
          total_attempts: number | null
          unique_users: number | null
          weeks_assigned: number | null
        }
        Relationships: []
      }
      pro_move_usage_view: {
        Row: {
          action_id: number | null
          attempts: number | null
          avg_confidence: number | null
          last_score_date: string | null
        }
        Relationships: []
      }
      v_onboarding_progress: {
        Row: {
          current_cycle: number | null
          current_week: number | null
          cycle_length_weeks: number | null
          location_id: string | null
          location_name: string | null
          onboarding_active: boolean | null
          org_id: string | null
          program_start_date: string | null
          role_id: number | null
          role_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      view_evaluation_items_enriched: {
        Row: {
          competency_id: number | null
          domain_id: number | null
          domain_name: string | null
          evaluation_at: string | null
          evaluation_id: string | null
          evaluation_type: string | null
          location_name: string | null
          observer_score: number | null
          organization_id: string | null
          primary_location_id: string | null
          program_year: number | null
          quarter: string | null
          role_id: number | null
          self_score: number | null
          staff_id: string | null
          staff_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competencies_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "fk_competencies_domain_id"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "locations_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
        ]
      }
      view_weekly_scores_with_competency: {
        Row: {
          action_id: number | null
          competency_id: number | null
          confidence_score: number | null
          created_at: string | null
          domain_id: number | null
          domain_name: string | null
          organization_id: string | null
          performance_score: number | null
          primary_location_id: string | null
          role_id: number | null
          staff_id: string | null
          weekly_focus_id: string | null
          weekly_score_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competencies_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "fk_competencies_domain_id"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "fk_pro_moves_competency_id"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["competency_id"]
          },
          {
            foreignKeyName: "locations_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_onboarding_progress"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "weekly_scores_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "view_evaluation_items_enriched"
            referencedColumns: ["staff_id"]
          },
        ]
      }
    }
    Functions: {
      add_backlog_if_missing: {
        Args: {
          p_action_id: number
          p_cycle: number
          p_staff_id: string
          p_week: number
        }
        Returns: undefined
      }
      backfill_historical_score_timestamps: {
        Args: {
          p_jitter_minutes?: number
          p_only_backfill?: boolean
          p_staff_id: string
        }
        Returns: number
      }
      bulk_upsert_pro_moves: { Args: { pro_moves_data: Json }; Returns: Json }
      check_sequencer_gate: {
        Args: { p_org_id: string; p_role_id?: number }
        Returns: Json
      }
      compare_conf_perf_to_eval: {
        Args: {
          p_end?: string
          p_location_ids?: string[]
          p_org_id: string
          p_role_ids?: number[]
          p_start?: string
          p_types?: string[]
          p_window_days?: number
        }
        Returns: {
          competency_id: number
          competency_name: string
          conf_avg: number
          domain_id: number
          domain_name: string
          eval_observer_avg: number
          eval_self_avg: number
          evaluation_id: string
          framework: string
          perf_avg: number
          primary_location_id: string
          staff_id: string
        }[]
      }
      delete_latest_week_data: { Args: { p_user_id: string }; Returns: Json }
      delete_week_data: {
        Args: {
          p_cycle: number
          p_role_id: number
          p_staff_id: string
          p_week: number
        }
        Returns: Json
      }
      delete_week_data_by_week: {
        Args: { p_role_id: number; p_staff_id: string; p_week_of: string }
        Returns: Json
      }
      get_calendar_week_status: {
        Args: { p_role_id: number; p_staff_id: string }
        Returns: {
          conf_count: number
          cycle: number
          is_current_week: boolean
          perf_count: number
          source: string
          total: number
          week_in_cycle: number
          week_of: string
        }[]
      }
      get_calibration: {
        Args: { p_role_id: number; p_staff_id: string; p_window?: number }
        Returns: Json
      }
      get_consistency: {
        Args: { p_staff_id: string; p_tz?: string; p_weeks?: number }
        Returns: Json
      }
      get_current_staff_id: { Args: never; Returns: string }
      get_cycle_week_status: {
        Args: { p_role_id: number; p_staff_id: string }
        Returns: {
          conf_count: number
          cycle: number
          perf_count: number
          total: number
          week_in_cycle: number
        }[]
      }
      get_evaluations_summary:
        | {
            Args: { p_staff_id: string }
            Returns: {
              avg_observer: number
              avg_self: number
              delta: number
              domain_name: string
              eval_id: string
              program_year: number
              quarter: string
              status: string
              submitted_at: string
              type: string
            }[]
          }
        | {
            Args: { p_only_submitted?: boolean; p_staff_id: string }
            Returns: {
              avg_observer: number
              avg_self: number
              delta: number
              domain_name: string
              eval_id: string
              program_year: number
              quarter: string
              status: string
              submitted_at: string
              type: string
            }[]
          }
      get_focus_cycle_week: {
        Args: { p_cycle: number; p_role_id: number; p_week: number }
        Returns: {
          action_statement: string
          display_order: number
          domain_name: string
          id: string
        }[]
      }
      get_last_progress_week: {
        Args: { p_staff_id: string }
        Returns: {
          is_complete: boolean
          last_cycle: number
          last_week: number
        }[]
      }
      get_location_domain_staff_averages: {
        Args: {
          p_end?: string
          p_include_no_eval?: boolean
          p_location_ids?: string[]
          p_org_id: string
          p_role_ids?: number[]
          p_start?: string
          p_types?: string[]
        }
        Returns: {
          avg_observer: number
          domain_id: number
          domain_name: string
          has_eval: boolean
          location_id: string
          location_name: string
          n_items: number
          staff_id: string
          staff_name: string
        }[]
      }
      get_performance_trend: {
        Args: { p_role_id: number; p_staff_id: string; p_window?: number }
        Returns: Json
      }
      get_staff_domain_avgs: {
        Args: {
          p_end: string
          p_eval_types?: string[]
          p_include_no_eval?: boolean
          p_location_ids?: string[]
          p_org_id: string
          p_role_ids?: number[]
          p_start: string
        }
        Returns: {
          domain_id: number
          domain_name: string
          has_eval: boolean
          last_eval_at: string
          location_id: string
          location_name: string
          n_items: number
          observer_avg: number
          role_id: number
          self_avg: number
          staff_id: string
          staff_name: string
        }[]
      }
      get_staff_domain_competencies: {
        Args: {
          p_domain_id: number
          p_end: string
          p_eval_types?: string[]
          p_location_ids?: string[]
          p_org_id: string
          p_role_ids?: number[]
          p_staff_id: string
          p_start: string
        }
        Returns: {
          competency_id: number
          competency_name: string
          framework: string
          last_eval_at: string
          n_items: number
          observer_avg: number
          self_avg: number
        }[]
      }
      get_staff_summary: {
        Args: never
        Returns: {
          email: string
          is_coach: boolean
          is_super_admin: boolean
          location: string
          name: string
          organization: string
          role_id: number
          staff_id: string
        }[]
      }
      get_strengths_weaknesses: {
        Args: {
          p_end?: string
          p_location_ids?: string[]
          p_org_id: string
          p_role_ids?: number[]
          p_start?: string
          p_types?: string[]
        }
        Returns: {
          avg_observer: number
          domain_id: number
          domain_name: string
          framework: string
          id: number
          level: string
          n_items: number
          name: string
        }[]
      }
      get_user_admin_status: {
        Args: never
        Returns: {
          coach: boolean
          super_admin: boolean
          user_id: string
        }[]
      }
      get_week_detail_by_week: {
        Args: {
          p_role_id: number
          p_source: string
          p_staff_id: string
          p_week_of: string
        }
        Returns: {
          action_statement: string
          confidence_score: number
          domain_name: string
          performance_score: number
        }[]
      }
      get_week_in_cycle: {
        Args: {
          check_date?: string
          cycle_length_weeks: number
          cycle_start_date: string
        }
        Returns: number
      }
      get_weekly_review: {
        Args: {
          p_cycle: number
          p_role_id: number
          p_staff_id: string
          p_week: number
        }
        Returns: {
          action_statement: string
          confidence_score: number
          domain_name: string
          performance_score: number
        }[]
      }
      is_coach_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_eligible_for_pro_moves: {
        Args: {
          check_date?: string
          hire_date: string
          onboarding_weeks: number
        }
        Returns: boolean
      }
      is_org_allowed_for_sequencing: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      needs_backfill: {
        Args: { p_role_id: number; p_staff_id: string }
        Returns: Json
      }
      replace_weekly_focus: {
        Args: {
          p_cycle: number
          p_role_id: number
          p_slots: Json
          p_week_in_cycle: number
        }
        Returns: Json
      }
      resolve_backlog_item: {
        Args: { p_action_id: number; p_staff_id: string }
        Returns: undefined
      }
      retime_backfill_cycle:
        | {
            Args: { p_cycle: number; p_role_id: number; p_staff_id: string }
            Returns: undefined
          }
        | {
            Args: { p_cycle: number; p_role_id: number; p_staff_id: string }
            Returns: string
          }
      rewrite_backfill_week: {
        Args: {
          p_cycle: number
          p_role_id: number
          p_staff_id: string
          p_week: number
        }
        Returns: undefined
      }
      seq_confidence_history_18w: {
        Args: {
          p_effective_date: string
          p_org_id: string
          p_role_id: number
          p_tz: string
        }
        Returns: {
          avg01: number
          n: number
          pro_move_id: number
          week_start: string
        }[]
      }
      seq_domain_coverage_8w: {
        Args: {
          p_effective_date: string
          p_org_id: string
          p_role_id: number
          p_tz: string
        }
        Returns: {
          appearances: number
          domain_id: number
          weeks_counted: number
        }[]
      }
      seq_last_selected_by_move: {
        Args: { p_org_id: string; p_role_id: number; p_tz: string }
        Returns: {
          pro_move_id: number
          week_start: string
        }[]
      }
      seq_latest_quarterly_evals:
        | {
            Args: { p_org_id: string; p_role_id: number }
            Returns: {
              competency_id: number
              effective_date: string
              score01: number
            }[]
          }
        | {
            Args: { role_id_arg: number }
            Returns: {
              competency_id: number
              score: number
            }[]
          }
    }
    Enums: {
      plan_status: "locked" | "draft"
      score_source: "live" | "backfill" | "backfill_historical"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      plan_status: ["locked", "draft"],
      score_source: ["live", "backfill", "backfill_historical"],
    },
  },
} as const
