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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      dashboard_lanes: {
        Row: {
          assignee_name: string
          created_at: string | null
          id: string
          position: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_name: string
          created_at?: string | null
          id?: string
          position?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_name?: string
          created_at?: string | null
          id?: string
          position?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dashboard_project_cards: {
        Row: {
          assignee_name: string
          correction_note: string | null
          created_at: string | null
          current_owner: string | null
          id: string
          internal_note: string | null
          lane_id: string | null
          manually_positioned: boolean | null
          manually_positioned_at: string | null
          position: number | null
          review_note: string | null
          review_requested_by: string | null
          review_requested_to: string | null
          review_status: string | null
          runrunit_project_id: number
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          assignee_name: string
          correction_note?: string | null
          created_at?: string | null
          current_owner?: string | null
          id?: string
          internal_note?: string | null
          lane_id?: string | null
          manually_positioned?: boolean | null
          manually_positioned_at?: string | null
          position?: number | null
          review_note?: string | null
          review_requested_by?: string | null
          review_requested_to?: string | null
          review_status?: string | null
          runrunit_project_id: number
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          assignee_name?: string
          correction_note?: string | null
          created_at?: string | null
          current_owner?: string | null
          id?: string
          internal_note?: string | null
          lane_id?: string | null
          manually_positioned?: boolean | null
          manually_positioned_at?: string | null
          position?: number | null
          review_note?: string | null
          review_requested_by?: string | null
          review_requested_to?: string | null
          review_status?: string | null
          runrunit_project_id?: number
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_project_cards_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "dashboard_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_project_cards_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "runrunit_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_cards_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_cards_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_planning_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_cards_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_people"
            referencedColumns: ["runrunit_project_id"]
          },
        ]
      }
      dashboard_project_planning: {
        Row: {
          created_at: string | null
          detail: string | null
          id: string
          planning_date: string | null
          planning_status: string
          position: number | null
          runrunit_project_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          id?: string
          planning_date?: string | null
          planning_status?: string
          position?: number | null
          runrunit_project_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          id?: string
          planning_date?: string | null
          planning_status?: string
          position?: number | null
          runrunit_project_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_project_planning_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: true
            referencedRelation: "runrunit_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_planning_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_planning_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: true
            referencedRelation: "v_planning_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_project_planning_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: true
            referencedRelation: "v_project_people"
            referencedColumns: ["runrunit_project_id"]
          },
        ]
      }
      dashboard_reviews: {
        Row: {
          correction_note: string | null
          created_at: string | null
          finished_at: string | null
          id: string
          lane_id: string | null
          original_assignee_name: string
          position: number | null
          requested_by_name: string
          review_status: string
          reviewer_name: string
          runrunit_project_id: number
          source_card_id: string | null
          updated_at: string | null
        }
        Insert: {
          correction_note?: string | null
          created_at?: string | null
          finished_at?: string | null
          id?: string
          lane_id?: string | null
          original_assignee_name: string
          position?: number | null
          requested_by_name: string
          review_status?: string
          reviewer_name: string
          runrunit_project_id: number
          source_card_id?: string | null
          updated_at?: string | null
        }
        Update: {
          correction_note?: string | null
          created_at?: string | null
          finished_at?: string | null
          id?: string
          lane_id?: string | null
          original_assignee_name?: string
          position?: number | null
          requested_by_name?: string
          review_status?: string
          reviewer_name?: string
          runrunit_project_id?: number
          source_card_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_reviews_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "dashboard_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_reviews_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "runrunit_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_reviews_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_reviews_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_planning_projects"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_reviews_runrunit_project_id_fkey"
            columns: ["runrunit_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_people"
            referencedColumns: ["runrunit_project_id"]
          },
          {
            foreignKeyName: "dashboard_reviews_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "dashboard_project_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_reviews_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_projects"
            referencedColumns: ["card_id"]
          },
        ]
      }
      dashboard_users: {
        Row: {
          access_level: string | null
          auth_user_id: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          access_level?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          access_level?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      runrunit_project_people: {
        Row: {
          assignee_id: string | null
          assignee_name: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          runrunit_project_id: number
          source: string | null
          team_id: number | null
          team_name: string | null
        }
        Insert: {
          assignee_id?: string | null
          assignee_name?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          runrunit_project_id: number
          source?: string | null
          team_id?: number | null
          team_name?: string | null
        }
        Update: {
          assignee_id?: string | null
          assignee_name?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          runrunit_project_id?: number
          source?: string | null
          team_id?: number | null
          team_name?: string | null
        }
        Relationships: []
      }
      runrunit_projects: {
        Row: {
          client_name: string | null
          closed_detected_at: string | null
          created_at: string | null
          created_at_runrunit: string | null
          desired_delivery_date: string | null
          discovered_at: string | null
          id: string
          is_new_candidate: boolean | null
          is_open: boolean | null
          is_tracking_enabled: boolean | null
          last_people_synced_at: string | null
          last_project_detail_synced_at: string | null
          last_synced_at: string | null
          name: string
          project_group_name: string | null
          project_sub_group_name: string | null
          raw_data: Json | null
          runrunit_project_id: number
          status: string | null
          updated_at_runrunit: string | null
        }
        Insert: {
          client_name?: string | null
          closed_detected_at?: string | null
          created_at?: string | null
          created_at_runrunit?: string | null
          desired_delivery_date?: string | null
          discovered_at?: string | null
          id?: string
          is_new_candidate?: boolean | null
          is_open?: boolean | null
          is_tracking_enabled?: boolean | null
          last_people_synced_at?: string | null
          last_project_detail_synced_at?: string | null
          last_synced_at?: string | null
          name: string
          project_group_name?: string | null
          project_sub_group_name?: string | null
          raw_data?: Json | null
          runrunit_project_id: number
          status?: string | null
          updated_at_runrunit?: string | null
        }
        Update: {
          client_name?: string | null
          closed_detected_at?: string | null
          created_at?: string | null
          created_at_runrunit?: string | null
          desired_delivery_date?: string | null
          discovered_at?: string | null
          id?: string
          is_new_candidate?: boolean | null
          is_open?: boolean | null
          is_tracking_enabled?: boolean | null
          last_people_synced_at?: string | null
          last_project_detail_synced_at?: string | null
          last_synced_at?: string | null
          name?: string
          project_group_name?: string | null
          project_sub_group_name?: string | null
          raw_data?: Json | null
          runrunit_project_id?: number
          status?: string | null
          updated_at_runrunit?: string | null
        }
        Relationships: []
      }
      runrunit_tasks: {
        Row: {
          board_stage_name: string | null
          close_date: string | null
          created_at: string | null
          desired_date: string | null
          id: string
          last_synced_at: string | null
          raw_data: Json | null
          responsible_name: string | null
          runrunit_project_id: number
          runrunit_task_id: number
          status: string | null
          task_type: string | null
          team_name: string | null
          title: string
        }
        Insert: {
          board_stage_name?: string | null
          close_date?: string | null
          created_at?: string | null
          desired_date?: string | null
          id?: string
          last_synced_at?: string | null
          raw_data?: Json | null
          responsible_name?: string | null
          runrunit_project_id: number
          runrunit_task_id: number
          status?: string | null
          task_type?: string | null
          team_name?: string | null
          title: string
        }
        Update: {
          board_stage_name?: string | null
          close_date?: string | null
          created_at?: string | null
          desired_date?: string | null
          id?: string
          last_synced_at?: string | null
          raw_data?: Json | null
          responsible_name?: string | null
          runrunit_project_id?: number
          runrunit_task_id?: number
          status?: string | null
          task_type?: string | null
          team_name?: string | null
          title?: string
        }
        Relationships: []
      }
      sync_control: {
        Row: {
          batch_size: number
          job_name: string
          last_offset: number
          last_run_at: string | null
          updated_at: string | null
        }
        Insert: {
          batch_size?: number
          job_name: string
          last_offset?: number
          last_run_at?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_size?: number
          job_name?: string
          last_offset?: number
          last_run_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_projects: {
        Row: {
          assignee_name: string | null
          card_id: string | null
          client_name: string | null
          created_at_runrunit: string | null
          desired_delivery_date: string | null
          is_open: boolean | null
          lane_id: string | null
          last_synced_at: string | null
          position: number | null
          project_group_name: string | null
          project_name: string | null
          runrunit_project_id: number | null
          status: string | null
          team_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_project_cards_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "dashboard_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_planning_projects: {
        Row: {
          client_name: string | null
          created_at_runrunit: string | null
          detail: string | null
          is_tracking_enabled: boolean | null
          last_synced_at: string | null
          planning_date: string | null
          planning_id: string | null
          planning_status: string | null
          planning_updated_at: string | null
          position: number | null
          project_group_name: string | null
          project_name: string | null
          runrunit_project_id: number | null
        }
        Relationships: []
      }
      v_project_people: {
        Row: {
          assignee_id: string | null
          assignee_name: string | null
          client_name: string | null
          created_at_runrunit: string | null
          last_synced_at: string | null
          project_group_name: string | null
          project_name: string | null
          project_sub_group_name: string | null
          runrunit_project_id: number | null
          team_id: number | null
          team_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_access_level: { Args: never; Returns: string }
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
