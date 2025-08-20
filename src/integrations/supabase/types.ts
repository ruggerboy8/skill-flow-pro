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
          name: string | null
          role_id: number | null
          status: string | null
        }
        Insert: {
          code?: string | null
          competency_id: number
          description?: string | null
          domain_id?: number | null
          name?: string | null
          role_id?: number | null
          status?: string | null
        }
        Update: {
          code?: string | null
          competency_id?: number
          description?: string | null
          domain_id?: number | null
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
          domain_id: number
          domain_name: string | null
        }
        Insert: {
          domain_id: number
          domain_name?: string | null
        }
        Update: {
          domain_id?: number
          domain_name?: string | null
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
          action_id: number
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
      staff: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_coach: boolean
          is_super_admin: boolean
          location: string | null
          name: string
          organization: string | null
          primary_location: string | null
          role_id: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_coach?: boolean
          is_super_admin?: boolean
          location?: string | null
          name: string
          organization?: string | null
          primary_location?: string | null
          role_id?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_coach?: boolean
          is_super_admin?: boolean
          location?: string | null
          name?: string
          organization?: string | null
          primary_location?: string | null
          role_id?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
          confidence_estimated: boolean
          confidence_score: number | null
          confidence_source: Database["public"]["Enums"]["score_source"]
          created_at: string | null
          entered_by: string
          id: string
          performance_date: string | null
          performance_estimated: boolean
          performance_score: number | null
          performance_source: Database["public"]["Enums"]["score_source"]
          selected_action_id: number | null
          staff_id: string | null
          updated_at: string | null
          weekly_focus_id: string | null
        }
        Insert: {
          confidence_date?: string | null
          confidence_estimated?: boolean
          confidence_score?: number | null
          confidence_source?: Database["public"]["Enums"]["score_source"]
          created_at?: string | null
          entered_by?: string
          id?: string
          performance_date?: string | null
          performance_estimated?: boolean
          performance_score?: number | null
          performance_source?: Database["public"]["Enums"]["score_source"]
          selected_action_id?: number | null
          staff_id?: string | null
          updated_at?: string | null
          weekly_focus_id?: string | null
        }
        Update: {
          confidence_date?: string | null
          confidence_estimated?: boolean
          confidence_score?: number | null
          confidence_source?: Database["public"]["Enums"]["score_source"]
          created_at?: string | null
          entered_by?: string
          id?: string
          performance_date?: string | null
          performance_estimated?: boolean
          performance_score?: number | null
          performance_source?: Database["public"]["Enums"]["score_source"]
          selected_action_id?: number | null
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
      bulk_upsert_pro_moves: {
        Args: { pro_moves_data: Json }
        Returns: Json
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
      is_super_admin: {
        Args: { _user_id: string }
        Returns: boolean
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
