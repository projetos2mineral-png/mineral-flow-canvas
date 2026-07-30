
-- 1) Allow authenticated users to insert their own dashboard_users row
CREATE POLICY "Usuário pode inserir seu próprio registro"
ON public.dashboard_users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = auth_user_id);

-- 2) Trigger to auto-create a dashboard_users row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_dashboard_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dashboard_users (auth_user_id, email, name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'responsável',
    true
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_dashboard ON auth.users;
CREATE TRIGGER on_auth_user_created_dashboard
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_dashboard_user();
