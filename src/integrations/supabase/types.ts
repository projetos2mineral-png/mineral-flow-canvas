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
      dashboard_board_settings: {
        Row: {
          antecedence_days: number
          assignee_name: string
          is_hidden: boolean
          updated_at: string
        }
        Insert: {
          antecedence_days?: number
          assignee_name: string
          is_hidden?: boolean
          updated_at?: string
        }
        Update: {
          antecedence_days?: number
          assignee_name?: string
          is_hidden?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_lanes: {
        Row: {
          assignee_name: string
          created_at: string | null
          id: string
          position: number | null
          reference_month: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_name: string
          created_at?: string | null
          id?: string
          position?: number | null
          reference_month?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_name?: string
          created_at?: string | null
          id?: string
          position?: number | null
          reference_month?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dashboard_manual_demand_assignees: {
        Row: {
          assignee_name: string | null
          checklist_items: Json
          checklist_selections: Json
          created_at: string
          demand_id: number
          estimated_hours: number
          id: number
          kanban_status: string
          lane_id: string | null
          manually_positioned: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assignee_name?: string | null
          checklist_items?: Json
          checklist_selections?: Json
          created_at?: string
          demand_id: number
          estimated_hours: number
          id?: number
          kanban_status?: string
          lane_id?: string | null
          manually_positioned?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assignee_name?: string | null
          checklist_items?: Json
          checklist_selections?: Json
          created_at?: string
          demand_id?: number
          estimated_hours?: number
          id?: number
          kanban_status?: string
          lane_id?: string | null
          manually_positioned?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_manual_demand_assignees_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "dashboard_manual_demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_manual_demand_assignees_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "dashboard_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_manual_demand_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "dashboard_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_manual_demands: {
        Row: {
          checklist_items: Json
          client_id: number | null
          client_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          desired_date: string
          id: number
          is_visible_on_dashboard: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          checklist_items?: Json
          client_id?: number | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          desired_date: string
          id?: number
          is_visible_on_dashboard?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          checklist_items?: Json
          client_id?: number | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          desired_date?: string
          id?: number
          is_visible_on_dashboard?: boolean
          name?: string
          status?: string
          updated_at?: string
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
          is_campo: boolean
          is_geo: boolean
          is_rev: boolean
          is_tec: boolean
          lane_id: string | null
          manual_estimated_hours: number | null
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
          is_campo?: boolean
          is_geo?: boolean
          is_rev?: boolean
          is_tec?: boolean
          lane_id?: string | null
          manual_estimated_hours?: number | null
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
          is_campo?: boolean
          is_geo?: boolean
          is_rev?: boolean
          is_tec?: boolean
          lane_id?: string | null
          manual_estimated_hours?: number | null
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
      dashboard_project_estimates: {
        Row: {
          assignee_name: string
          calculation_details: Json | null
          id: string
          runrunit_project_id: number
          total_estimated_hours: number | null
          total_tasks: number | null
          updated_at: string | null
        }
        Insert: {
          assignee_name: string
          calculation_details?: Json | null
          id?: string
          runrunit_project_id: number
          total_estimated_hours?: number | null
          total_tasks?: number | null
          updated_at?: string | null
        }
        Update: {
          assignee_name?: string
          calculation_details?: Json | null
          id?: string
          runrunit_project_id?: number
          total_estimated_hours?: number | null
          total_tasks?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "dashboard_cards_with_estimates"
            referencedColumns: ["id"]
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
      dashboard_sync_lock: {
        Row: {
          current_run_id: string | null
          fencing_token: number
          id: number
          is_locked: boolean
          lock_type: string | null
          locked_at: string | null
          locked_by: string | null
          updated_at: string
        }
        Insert: {
          current_run_id?: string | null
          fencing_token?: number
          id?: number
          is_locked?: boolean
          lock_type?: string | null
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
        }
        Update: {
          current_run_id?: string | null
          fencing_token?: number
          id?: number
          is_locked?: boolean
          lock_type?: string | null
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_sync_lock_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "dashboard_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sync_run_items: {
        Row: {
          attempts: number
          claim_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          next_attempt_at: string
          project_name: string | null
          run_id: string
          runrunit_project_id: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claim_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          next_attempt_at?: string
          project_name?: string | null
          run_id: string
          runrunit_project_id: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claim_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          next_attempt_at?: string
          project_name?: string | null
          run_id?: string
          runrunit_project_id?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_sync_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dashboard_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sync_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          fencing_token: number
          finished_at: string | null
          heartbeat_at: string
          id: string
          locked_by: string | null
          parent_run_id: string | null
          pending_count: number
          started_at: string
          status: string
          success_count: number
          sync_type: string
          total_projects: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          fencing_token: number
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          locked_by?: string | null
          parent_run_id?: string | null
          pending_count?: number
          started_at?: string
          status?: string
          success_count?: number
          sync_type: string
          total_projects?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          fencing_token?: number
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          locked_by?: string | null
          parent_run_id?: string | null
          pending_count?: number
          started_at?: string
          status?: string
          success_count?: number
          sync_type?: string
          total_projects?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_sync_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "dashboard_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sync_status: {
        Row: {
          id: number
          last_result: Json | null
          last_run_at: string | null
          sync_name: string
          sync_source: string | null
          updated_at: string | null
        }
        Insert: {
          id?: never
          last_result?: Json | null
          last_run_at?: string | null
          sync_name: string
          sync_source?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: never
          last_result?: Json | null
          last_run_at?: string | null
          sync_name?: string
          sync_source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dashboard_user_capacity: {
        Row: {
          capacity_hours: number
          created_at: string | null
          id: string
          reference_month: string
          updated_at: string | null
          user_name: string
        }
        Insert: {
          capacity_hours: number
          created_at?: string | null
          id?: string
          reference_month: string
          updated_at?: string | null
          user_name: string
        }
        Update: {
          capacity_hours?: number
          created_at?: string | null
          id?: string
          reference_month?: string
          updated_at?: string | null
          user_name?: string
        }
        Relationships: []
      }
      dashboard_user_daily_worked: {
        Row: {
          automatic_seconds: number
          created_at: string
          id: string
          import_id: string | null
          last_imported_at: string
          manual_seconds: number
          runrunit_user_id: string
          runrunit_user_name: string | null
          total_seconds: number
          updated_at: string
          user_name: string
          work_date: string
        }
        Insert: {
          automatic_seconds?: number
          created_at?: string
          id?: string
          import_id?: string | null
          last_imported_at?: string
          manual_seconds?: number
          runrunit_user_id: string
          runrunit_user_name?: string | null
          total_seconds?: number
          updated_at?: string
          user_name: string
          work_date: string
        }
        Update: {
          automatic_seconds?: number
          created_at?: string
          id?: string
          import_id?: string | null
          last_imported_at?: string
          manual_seconds?: number
          runrunit_user_id?: string
          runrunit_user_name?: string | null
          total_seconds?: number
          updated_at?: string
          user_name?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_user_daily_worked_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "dashboard_worked_hours_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_user_runrunit_mapping: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          runrunit_user_id: string
          runrunit_user_name: string | null
          updated_at: string
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          runrunit_user_id: string
          runrunit_user_name?: string | null
          updated_at?: string
          user_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          runrunit_user_id?: string
          runrunit_user_name?: string | null
          updated_at?: string
          user_name?: string
        }
        Relationships: []
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
      dashboard_weekly_plan: {
        Row: {
          assignee_name: string
          created_at: string | null
          id: string
          position: number
          reference_month: string
          runrunit_project_id: number
          updated_at: string | null
          week_number: number | null
        }
        Insert: {
          assignee_name: string
          created_at?: string | null
          id?: string
          position?: number
          reference_month: string
          runrunit_project_id: number
          updated_at?: string | null
          week_number?: number | null
        }
        Update: {
          assignee_name?: string
          created_at?: string | null
          id?: string
          position?: number
          reference_month?: string
          runrunit_project_id?: number
          updated_at?: string | null
          week_number?: number | null
        }
        Relationships: []
      }
      dashboard_worked_hours_history: {
        Row: {
          detected_at: string
          id: string
          import_id: string | null
          new_automatic_seconds: number
          new_manual_seconds: number
          new_total_seconds: number
          previous_automatic_seconds: number | null
          previous_manual_seconds: number | null
          previous_total_seconds: number | null
          runrunit_user_id: string
          user_name: string
          work_date: string
        }
        Insert: {
          detected_at?: string
          id?: string
          import_id?: string | null
          new_automatic_seconds: number
          new_manual_seconds: number
          new_total_seconds: number
          previous_automatic_seconds?: number | null
          previous_manual_seconds?: number | null
          previous_total_seconds?: number | null
          runrunit_user_id: string
          user_name: string
          work_date: string
        }
        Update: {
          detected_at?: string
          id?: string
          import_id?: string | null
          new_automatic_seconds?: number
          new_manual_seconds?: number
          new_total_seconds?: number
          previous_automatic_seconds?: number | null
          previous_manual_seconds?: number | null
          previous_total_seconds?: number | null
          runrunit_user_id?: string
          user_name?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_worked_hours_history_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "dashboard_worked_hours_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_worked_hours_imports: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          period_end: string
          period_start: string
          result_summary: Json | null
          rows_changed: number
          rows_received: number
          rows_upserted: number
          rows_without_mapping: number
          rows_without_user: number
          source: string
          started_at: string
          status: string
          trigger_source: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          period_end: string
          period_start: string
          result_summary?: Json | null
          rows_changed?: number
          rows_received?: number
          rows_upserted?: number
          rows_without_mapping?: number
          rows_without_user?: number
          source?: string
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          result_summary?: Json | null
          rows_changed?: number
          rows_received?: number
          rows_upserted?: number
          rows_without_mapping?: number
          rows_without_user?: number
          source?: string
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Relationships: []
      }
      qfq_atividades: {
        Row: {
          ativo: boolean
          categoria: string | null
          complexidade: string | null
          created_at: string
          grupo: string | null
          id: number
          nome: string
          ordem: number | null
          software: string | null
          tempo_esperado_horas: number | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          complexidade?: string | null
          created_at?: string
          grupo?: string | null
          id?: never
          nome: string
          ordem?: number | null
          software?: string | null
          tempo_esperado_horas?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          complexidade?: string | null
          created_at?: string
          grupo?: string | null
          id?: never
          nome?: string
          ordem?: number | null
          software?: string | null
          tempo_esperado_horas?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qfq_colaboradores: {
        Row: {
          ativo: boolean
          created_at: string
          id: number
          nome: string
          ordem: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: never
          nome: string
          ordem?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: never
          nome?: string
          ordem?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      qfq_matriz: {
        Row: {
          atividade_id: number
          colaborador_id: number
          created_at: string
          id: number
          nivel: string
          updated_at: string
        }
        Insert: {
          atividade_id: number
          colaborador_id: number
          created_at?: string
          id?: never
          nivel: string
          updated_at?: string
        }
        Update: {
          atividade_id?: number
          colaborador_id?: number
          created_at?: string
          id?: never
          nivel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qfq_matriz_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "qfq_atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qfq_matriz_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "qfq_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      runrunit_estimativas_tarefas: {
        Row: {
          atualizado_em: string | null
          created_at: string | null
          id: string
          mediana_horas: number | null
          nivel_confianca: string | null
          origem_estimativa: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          quantidade_historico: number | null
          responsavel_id: string
          responsavel_nome: string
          tipo_tarefa: string
        }
        Insert: {
          atualizado_em?: string | null
          created_at?: string | null
          id?: string
          mediana_horas?: number | null
          nivel_confianca?: string | null
          origem_estimativa?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          quantidade_historico?: number | null
          responsavel_id: string
          responsavel_nome: string
          tipo_tarefa: string
        }
        Update: {
          atualizado_em?: string | null
          created_at?: string | null
          id?: string
          mediana_horas?: number | null
          nivel_confianca?: string | null
          origem_estimativa?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          quantidade_historico?: number | null
          responsavel_id?: string
          responsavel_nome?: string
          tipo_tarefa?: string
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
      webhook_test_logs: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_cards_with_estimates: {
        Row: {
          assignee_name: string | null
          calculation_details: Json | null
          correction_note: string | null
          created_at: string | null
          current_owner: string | null
          id: string | null
          internal_note: string | null
          lane_id: string | null
          manually_positioned: boolean | null
          manually_positioned_at: string | null
          position: number | null
          review_note: string | null
          review_requested_by: string | null
          review_requested_to: string | null
          review_status: string | null
          runrunit_project_id: number | null
          status: string | null
          total_estimated_hours: number | null
          total_tasks: number | null
          updated_at: string | null
          updated_by: string | null
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
      dashboard_apply_worked_hours: {
        Args: { p_import_id: string; p_rows: Json }
        Returns: Json
      }
      dashboard_month_title_to_date: {
        Args: { p_title: string }
        Returns: string
      }
      sync_acquire_lock: {
        Args: {
          p_created_by?: string
          p_locked_by: string
          p_project_ids?: number[]
          p_sync_type: string
        }
        Returns: Json
      }
      sync_allocate_project_cards: {
        Args: { p_project_id: number }
        Returns: number
      }
      sync_assert_fence: {
        Args: { p_run_id: string; p_token: number }
        Returns: undefined
      }
      sync_claim_next: {
        Args: { p_run_id: string; p_token: number }
        Returns: Json
      }
      sync_complete_item: {
        Args: {
          p_claim_id: string
          p_item_id: string
          p_run_id: string
          p_token: number
        }
        Returns: undefined
      }
      sync_current_run: { Args: never; Returns: Json }
      sync_fail_run: {
        Args: { p_error: string; p_run_id: string; p_token: number }
        Returns: undefined
      }
      sync_finalize: {
        Args: { p_run_id: string; p_token: number }
        Returns: Json
      }
      sync_heartbeat: {
        Args: { p_run_id: string; p_token: number }
        Returns: undefined
      }
      sync_max_attempts: { Args: never; Returns: number }
      sync_month_title: { Args: { d: string }; Returns: string }
      sync_persist_project: {
        Args: {
          p_claim_id: string
          p_item_id: string
          p_people: Json
          p_project: Json
          p_run_id: string
          p_tasks: Json
          p_token: number
        }
        Returns: Json
      }
      sync_record_failure: {
        Args: {
          p_claim_id: string
          p_error: string
          p_item_id: string
          p_run_id: string
          p_token: number
        }
        Returns: Json
      }
      sync_recover_stale: { Args: never; Returns: Json }
      sync_refresh_counts: { Args: { p_run_id: string }; Returns: undefined }
      sync_stale_after: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
