export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
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
        Relationships: []
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
          competency_id: number | null
          date_added: string | null
          status: string | null
          steps: string | null
          version: string | null
        }
        Insert: {
          action_id: number
          action_statement?: string | null
          competency_id?: number | null
          date_added?: string | null
          status?: string | null
          steps?: string | null
          version?: string | null
        }
        Update: {
          action_id?: number
          action_statement?: string | null
          competency_id?: number | null
          date_added?: string | null
          status?: string | null
          steps?: string | null
          version?: string | null
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
      staff: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
          organization: string | null
          primary_location: string | null
          role_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name: string
          organization?: string | null
          primary_location?: string | null
          role_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          organization?: string | null
          primary_location?: string | null
          role_id?: number | null
          updated_at?: string | null
          user_id?: string | null
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
      weekly_focus: {
        Row: {
          action_id: number | null
          created_at: string | null
          display_order: number | null
          id: string
          iso_week: number
          iso_year: number
          role_id: number | null
        }
        Insert: {
          action_id?: number | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          iso_week: number
          iso_year: number
          role_id?: number | null
        }
        Update: {
          action_id?: number | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          iso_week?: number
          iso_year?: number
          role_id?: number | null
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
          confidence_score: number | null
          created_at: string | null
          id: string
          performance_date: string | null
          performance_score: number | null
          staff_id: string | null
          updated_at: string | null
          weekly_focus_id: string | null
        }
        Insert: {
          confidence_date?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          performance_date?: string | null
          performance_score?: number | null
          staff_id?: string | null
          updated_at?: string | null
          weekly_focus_id?: string | null
        }
        Update: {
          confidence_date?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          performance_date?: string | null
          performance_score?: number | null
          staff_id?: string | null
          updated_at?: string | null
          weekly_focus_id?: string | null
        }
        Relationships: [
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
            referencedRelation: "v_staff_week_status"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "weekly_scores_weekly_focus_id_fkey"
            columns: ["weekly_focus_id"]
            isOneToOne: false
            referencedRelation: "v_staff_week_status"
            referencedColumns: ["weekly_focus_id"]
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
    }
    Views: {
      v_staff_week_status: {
        Row: {
          confidence_score: number | null
          iso_week: number | null
          iso_year: number | null
          performance_score: number | null
          role_id: number | null
          staff_id: string | null
          weekly_focus_id: string | null
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
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
