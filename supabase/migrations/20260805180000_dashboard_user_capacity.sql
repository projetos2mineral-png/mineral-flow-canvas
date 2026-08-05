CREATE TABLE IF NOT EXISTS public.dashboard_user_capacity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name text NOT NULL,
    reference_month text NOT NULL, -- Formato: "Julho/2026"
    capacity_hours numeric NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_name, reference_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_user_capacity TO authenticated;
GRANT ALL ON public.dashboard_user_capacity TO service_role;

ALTER TABLE public.dashboard_user_capacity ENABLE ROW LEVEL SECURITY;

-- Como o sistema usa dashboard_users e assignees nominais, permitimos leitura para todos os autenticados
CREATE POLICY "Allow all authenticated users to read capacity"
ON public.dashboard_user_capacity FOR SELECT TO authenticated USING (true);

-- Permissão de escrita para líderes e admins (ou qualquer autenticado se não houver controle de roles rígido ainda)
-- Baseado no contexto do projeto, vamos permitir que qualquer 'authenticated' edite por enquanto, 
-- ou restringir se houver v_dashboard_users.access_level.
CREATE POLICY "Allow all authenticated users to manage capacity"
ON public.dashboard_user_capacity FOR ALL TO authenticated
USING (true)
WITH CHECK (true);
