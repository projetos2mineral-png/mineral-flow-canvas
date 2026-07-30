
-- 1) Helper: current access level (security definer to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.current_access_level()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_level FROM public.dashboard_users WHERE auth_user_id = auth.uid() LIMIT 1),
    'comum'
  );
$$;

REVOKE ALL ON FUNCTION public.current_access_level() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_access_level() TO authenticated;

-- 2) Seed access_level for existing admin emails
UPDATE public.dashboard_users
SET access_level = 'administrador', updated_at = now()
WHERE lower(email) IN (
  'projetos@mineralgeologia.com.br',
  'projetos2@mineralgeologia.com.br',
  'projetos3@mineralgeologia.com.br'
) AND (access_level IS DISTINCT FROM 'administrador');

-- 3) Ensure default 'comum' for any NULL rows
UPDATE public.dashboard_users
SET access_level = 'comum', updated_at = now()
WHERE access_level IS NULL;

-- 4) Update signup trigger to grant admin for the initial admin emails
CREATE OR REPLACE FUNCTION public.handle_new_dashboard_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level text := 'comum';
BEGIN
  IF lower(NEW.email) IN (
    'projetos@mineralgeologia.com.br',
    'projetos2@mineralgeologia.com.br',
    'projetos3@mineralgeologia.com.br'
  ) THEN
    v_level := 'administrador';
  END IF;

  INSERT INTO public.dashboard_users (auth_user_id, email, name, role, is_active, access_level)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'responsável',
    true,
    v_level
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5) Admin-only management policies on dashboard_users
DROP POLICY IF EXISTS "Administradores podem atualizar qualquer usuário" ON public.dashboard_users;
CREATE POLICY "Administradores podem atualizar qualquer usuário"
ON public.dashboard_users
FOR UPDATE
TO authenticated
USING (public.current_access_level() = 'administrador')
WITH CHECK (public.current_access_level() = 'administrador');

DROP POLICY IF EXISTS "Administradores podem excluir usuários" ON public.dashboard_users;
CREATE POLICY "Administradores podem excluir usuários"
ON public.dashboard_users
FOR DELETE
TO authenticated
USING (public.current_access_level() = 'administrador');
