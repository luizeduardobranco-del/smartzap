-- Fix handle_new_user trigger: add SET search_path = public
-- Without this, Supabase auth triggers can't find public schema tables

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  free_plan_id UUID;
  company_name TEXT;
  org_slug TEXT;
BEGIN
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    split_part(NEW.email, '@', 1)
  );

  org_slug := lower(regexp_replace(company_name, '[^a-zA-Z0-9]', '-', 'g'))
    || '-' || substring(gen_random_uuid()::text, 1, 8);

  SELECT id INTO free_plan_id FROM public.plans WHERE slug = 'free' LIMIT 1;

  INSERT INTO public.organizations (name, slug, plan_id, credits_balance, trial_ends_at)
  VALUES (
    company_name,
    org_slug,
    free_plan_id,
    100,
    now() + INTERVAL '7 days'
  )
  RETURNING id INTO org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
