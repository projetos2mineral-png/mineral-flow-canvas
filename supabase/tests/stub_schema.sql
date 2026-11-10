-- Esquema mínimo (espelho das colunas usadas) para testar as RPCs em Postgres local.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE runrunit_projects (id uuid DEFAULT gen_random_uuid(), runrunit_project_id bigint PRIMARY KEY, name text NOT NULL,
  client_name text, project_group_name text, project_sub_group_name text, status text, is_open boolean, raw_data jsonb,
  desired_delivery_date date, created_at_runrunit timestamptz, updated_at_runrunit timestamptz, last_synced_at timestamptz,
  last_project_detail_synced_at timestamptz, last_people_synced_at timestamptz, is_tracking_enabled boolean DEFAULT false,
  is_new_candidate boolean DEFAULT false);
CREATE TABLE runrunit_tasks (id uuid DEFAULT gen_random_uuid(), runrunit_task_id bigint PRIMARY KEY, runrunit_project_id bigint NOT NULL,
  title text NOT NULL, responsible_name text, team_name text, task_type text, status text, board_stage_name text,
  desired_date timestamptz, close_date timestamptz, raw_data jsonb, last_synced_at timestamptz);
CREATE TABLE runrunit_project_people (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), runrunit_project_id bigint NOT NULL,
  assignee_id text, assignee_name text, team_id bigint, team_name text, source text, last_synced_at timestamptz);
CREATE TABLE dashboard_lanes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignee_name text NOT NULL, title text NOT NULL,
  position int, created_at timestamptz DEFAULT now());
CREATE TABLE dashboard_project_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), runrunit_project_id bigint NOT NULL,
  assignee_name text NOT NULL, lane_id uuid, status text, position int, review_status text, manually_positioned boolean,
  updated_at timestamptz, UNIQUE (runrunit_project_id, assignee_name));
CREATE TABLE dashboard_board_settings (assignee_name text PRIMARY KEY, antecedence_days int NOT NULL DEFAULT 0);
CREATE TABLE dashboard_project_estimates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), runrunit_project_id bigint);
