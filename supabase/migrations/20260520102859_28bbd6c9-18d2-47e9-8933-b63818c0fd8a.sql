
ALTER TYPE public.vehicle_kind ADD VALUE IF NOT EXISTS 'furgao';
ALTER TYPE public.vehicle_kind ADD VALUE IF NOT EXISTS 'particular';

DO $$ BEGIN
  CREATE TYPE public.fuel_card_status AS ENUM ('ativo','inativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fuel_cards
  ADD COLUMN IF NOT EXISTS status public.fuel_card_status NOT NULL DEFAULT 'ativo';

CREATE TABLE IF NOT EXISTS public.fuel_card_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.fuel_cards(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, vehicle_id)
);
ALTER TABLE public.fuel_card_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage card vehicles" ON public.fuel_card_vehicles;
CREATE POLICY "managers manage card vehicles" ON public.fuel_card_vehicles
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "members view card vehicles" ON public.fuel_card_vehicles;
CREATE POLICY "members view card vehicles" ON public.fuel_card_vehicles
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "super admin card vehicles" ON public.fuel_card_vehicles;
CREATE POLICY "super admin card vehicles" ON public.fuel_card_vehicles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.fuel_card_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.fuel_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, user_id)
);
ALTER TABLE public.fuel_card_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage card users" ON public.fuel_card_users;
CREATE POLICY "managers manage card users" ON public.fuel_card_users
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "members view card users" ON public.fuel_card_users;
CREATE POLICY "members view card users" ON public.fuel_card_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "super admin card users" ON public.fuel_card_users;
CREATE POLICY "super admin card users" ON public.fuel_card_users
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "members view company cards" ON public.fuel_cards;
DROP POLICY IF EXISTS "members view authorized cards" ON public.fuel_cards;
CREATE POLICY "members view authorized cards" ON public.fuel_cards
  FOR SELECT TO authenticated
  USING (
    public.is_company_manager(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.fuel_card_users fcu
      WHERE fcu.card_id = fuel_cards.id AND fcu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members create company cards" ON public.fuel_cards;
DROP POLICY IF EXISTS "managers create company cards" ON public.fuel_cards;
CREATE POLICY "managers create company cards" ON public.fuel_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

ALTER TABLE public.fuel_records
  ADD COLUMN IF NOT EXISTS price_per_liter numeric,
  ADD COLUMN IF NOT EXISTS plate_photo_path text;
