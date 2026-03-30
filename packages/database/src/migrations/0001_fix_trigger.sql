-- Corrige o trigger de criação automática de organização no signup
-- O problema: RLS bloqueando inserts dentro do trigger

-- Remover trigger e função antigas
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Recriar função com bypass de RLS e tratamento de erro robusto
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_free_plan_id UUID;
  v_company_name TEXT;
  v_org_slug TEXT;
BEGIN
  -- Desabilitar RLS para esta transação (necessário em Supabase)
  SET LOCAL row_security = OFF;

  -- Definir nome da empresa
  v_company_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Gerar slug único
  v_org_slug := lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Buscar plano free
  SELECT id INTO v_free_plan_id FROM public.plans WHERE slug = 'free' LIMIT 1;

  -- Criar organização
  INSERT INTO public.organizations (name, slug, plan_id, credits_balance, trial_ends_at)
  VALUES (
    v_company_name,
    v_org_slug,
    v_free_plan_id,
    100,
    now() + INTERVAL '14 days'
  )
  RETURNING id INTO v_org_id;

  -- Adicionar usuário como owner
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não bloqueia o signup
    RAISE WARNING 'handle_new_user error: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Recriar trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Garantir permissões corretas
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.organizations TO authenticated, service_role;
GRANT ALL ON public.organization_members TO authenticated, service_role;
