
-- Enums
DO $$ BEGIN
  CREATE TYPE public.vehicle_status AS ENUM ('ativo','inativo','manutencao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.fuel_type AS ENUM ('gasolina','diesel','etanol','flex','gnv','eletrico','hibrido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.vehicle_kind AS ENUM ('carro','moto','van','caminhao','utilitario','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.fuel_purpose AS ENUM ('profissional','pessoal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vehicles
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plate text NOT NULL,
  brand text,
  model text,
  year int,
  current_km int NOT NULL DEFAULT 0,
  fuel_type public.fuel_type NOT NULL DEFAULT 'flex',
  kind public.vehicle_kind NOT NULL DEFAULT 'carro',
  status public.vehicle_status NOT NULL DEFAULT 'ativo',
  plate_photo_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, plate)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_company ON public.vehicles(company_id);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_vehicles_touch ON public.vehicles;
CREATE TRIGGER trg_vehicles_touch BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vehicle assignments
CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_vassign_user ON public.vehicle_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_vassign_vehicle ON public.vehicle_assignments(vehicle_id);
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Fuel cards
CREATE TABLE IF NOT EXISTS public.fuel_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  number text NOT NULL,
  label text,
  photo_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS idx_fcards_company ON public.fuel_cards(company_id);
ALTER TABLE public.fuel_cards ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_fuel_cards_touch ON public.fuel_cards;
CREATE TRIGGER trg_fuel_cards_touch BEFORE UPDATE ON public.fuel_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Fuel records
CREATE TABLE IF NOT EXISTS public.fuel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL,
  card_id uuid REFERENCES public.fuel_cards(id) ON DELETE SET NULL,
  km int NOT NULL,
  liters numeric(10,3) NOT NULL,
  amount numeric(12,2) NOT NULL,
  purpose public.fuel_purpose NOT NULL DEFAULT 'profissional',
  pump_photo_path text,
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fuel_company ON public.fuel_records(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle ON public.fuel_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_driver ON public.fuel_records(driver_id);
ALTER TABLE public.fuel_records ENABLE ROW LEVEL SECURITY;

-- ===== RLS =====
-- vehicles
CREATE POLICY "managers manage vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "employees view assigned vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicle_assignments va
    WHERE va.vehicle_id = vehicles.id AND va.user_id = auth.uid()
  ));
CREATE POLICY "super admin vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- assignments
CREATE POLICY "managers manage vehicle assignments" ON public.vehicle_assignments
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "users view own assignments" ON public.vehicle_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "super admin assignments" ON public.vehicle_assignments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- fuel cards (members of company can view/create — sharable)
CREATE POLICY "members view company cards" ON public.fuel_cards
  FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "members create company cards" ON public.fuel_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "managers manage company cards" ON public.fuel_cards
  FOR UPDATE TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "managers delete company cards" ON public.fuel_cards
  FOR DELETE TO authenticated USING (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "super admin cards" ON public.fuel_cards
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- fuel records
CREATE POLICY "managers view company fuel" ON public.fuel_records
  FOR SELECT TO authenticated USING (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "managers manage company fuel" ON public.fuel_records
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "drivers view own fuel" ON public.fuel_records
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "drivers insert fuel for assigned vehicles" ON public.fuel_records
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.vehicle_assignments va
      WHERE va.vehicle_id = fuel_records.vehicle_id AND va.user_id = auth.uid()
    )
  );
CREATE POLICY "super admin fuel" ON public.fuel_records
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- Storage bucket (private) — path layout: <company_id>/<kind>/<file>
INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet', 'fleet', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fleet members read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fleet'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "fleet members upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fleet'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "fleet managers delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fleet'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
