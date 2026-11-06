-- Stubs mínimos do ambiente Supabase/OmniBiz para testar as migrações 0007 e 0008.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, business_vertical text DEFAULT 'cleaning_services',
  enabled_modules text[] NOT NULL DEFAULT '{}', country text DEFAULT 'PT', billing_country text DEFAULT 'PT', timezone text DEFAULT 'Europe/Lisbon',
  CONSTRAINT companies_business_vertical_check CHECK (business_vertical = ANY (ARRAY['cleaning_services','restaurant_delivery','generic','building_materials','hospitality','auto_repair']))
);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, is_active boolean DEFAULT true, status text DEFAULT 'ativo', termination_date date);
CREATE TABLE public.user_roles (user_id uuid REFERENCES public.profiles(id), company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, role text);
CREATE TABLE public.super_admins (user_id uuid PRIMARY KEY);
GRANT SELECT ON public.companies, public.profiles, public.user_roles TO authenticated;

CREATE FUNCTION public.is_super_admin(_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id=_u) $$;
CREATE FUNCTION public.is_company_member(_u uuid, _c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_u AND company_id=_c) OR public.is_super_admin(_u) $$;
CREATE FUNCTION public.is_company_manager(_u uuid, _c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_u AND company_id=_c AND role IN ('manager','owner')) OR public.is_super_admin(_u) $$;
CREATE FUNCTION public.company_module_enabled(_c uuid, _m text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id=_c AND _m = ANY (c.enabled_modules)) $$;
CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
