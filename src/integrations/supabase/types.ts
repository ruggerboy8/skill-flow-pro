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
        ]
      }
      evaluations: {
        Row: {
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
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string
          cycle_length_weeks: number
          id: string
          name: string
          organization_id: string
          program_start_date: string
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string
          cycle_length_weeks?: number
          id?: string
          name: string
          organization_id: string
          program_start_date: string
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string
          cycle_length_weeks?: number
          id?: string
          name?: string
          organization_id?: string
          program_start_date?: string
          slug?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
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
        ]
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
          created_at: string | null
          email: string
          hire_date: string | null
          id: string
          is_coach: boolean
          is_super_admin: boolean
          location: string | null
          name: string
          onboarding_weeks: number
          organization: string | null
          primary_location: string | null
          primary_location_id: string | null
          role_id: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          hire_date?: string | null
          id?: string
          is_coach?: boolean
          is_super_admin?: boolean
          location?: string | null
          name: string
          onboarding_weeks?: number
          organization?: string | null
          primary_location?: string | null
          primary_location_id?: string | null
          role_id?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          hire_date?: string | null
          id?: string
          is_coach?: boolean
          is_super_admin?: boolean
          location?: string | null
          name?: string
          onboarding_weeks?: number
          organization?: string | null
          primary_location?: string | null
          primary_location_id?: string | null
          role_id?: number | null
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
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
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
        Relationships: []
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
            foreignKeyName: "weekly_scores_weekly_focus_id_fkey"
            columns: ["weekly_focus_id"]
            isOneToOne: false
            referencedRelation: "weekly_focus"
            referencedColumns: ["id"]
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
      [_ in never]: never
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
      bulk_upsert_pro_moves: {
        Args: { pro_moves_data: Json }
        Returns: Json
      }
      delete_latest_week_data: {
        Args: { p_user_id: string }
        Returns: Json
      }
      delete_week_data: {
        Args: {
          p_cycle: number
          p_role_id: number
          p_staff_id: string
          p_week: number
        }
        Returns: Json
      }
      get_calibration: {
        Args: { p_role_id: number; p_staff_id: string; p_window?: number }
        Returns: Json
      }
      get_consistency: {
        Args: { p_staff_id: string; p_tz?: string; p_weeks?: number }
        Returns: Json
      }
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
      get_evaluations_summary: {
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
      get_performance_trend: {
        Args: { p_role_id: number; p_staff_id: string; p_window?: number }
        Returns: Json
      }
      get_staff_summary: {
        Args: Record<PropertyKey, never>
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
      get_user_admin_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          coach: boolean
          super_admin: boolean
          user_id: string
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
      is_coach_or_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_eligible_for_pro_moves: {
        Args: {
          check_date?: string
          hire_date: string
          onboarding_weeks: number
        }
        Returns: boolean
      }
      is_super_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
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
      retime_backfill_cycle: {
        Args:
          | { p_cycle: number; p_role_id: number; p_staff_id: string }
          | { p_cycle: number; p_role_id: number; p_staff_id: string }
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
    }
    Enums: {
      score_source: "live" | "backfill"
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
      score_source: ["live", "backfill"],
    },
  },
} as const
