
DO $$ BEGIN CREATE TYPE public.geo_policy AS ENUM ('alert','justify','block'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.punch_event_kind AS ENUM ('arrival','start','pause','resume','stop','departure'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.geo_status AS ENUM ('within','out_of_range','no_location'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.geo_reason_code AS ENUM ('WITHIN_RADIUS','OUT_OF_RADIUS','NO_GPS','GPS_TIMEOUT','GPS_DENIED','CLIENT_WITHOUT_LOCATION','LOW_ACCURACY','MANUAL_OVERRIDE','ADMIN_OVERRIDE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.location_source AS ENUM ('gps','wifi','beacon','qr_code','nfc','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS geo_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_lng double precision,
  ADD COLUMN IF NOT EXISTS geo_radius_m integer,
  ADD COLUMN IF NOT EXISTS geo_address text;

ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS geo_required_start boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_required_stop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_default_radius_m integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS geo_out_of_range_policy_start public.geo_policy NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS geo_out_of_range_policy_stop public.geo_policy NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS geo_no_location_policy_start public.geo_policy NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS geo_no_location_policy_stop public.geo_policy NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS geo_photo_start_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_photo_stop_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_policy_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS start_geo_status public.geo_status,
  ADD COLUMN IF NOT EXISTS end_geo_status public.geo_status,
  ADD COLUMN IF NOT EXISTS start_geo_reason_code public.geo_reason_code,
  ADD COLUMN IF NOT EXISTS end_geo_reason_code public.geo_reason_code,
  ADD COLUMN IF NOT EXISTS start_geo_reason_text text,
  ADD COLUMN IF NOT EXISTS end_geo_reason_text text,
  ADD COLUMN IF NOT EXISTS geo_policy_version integer;

CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 2 * 6371000 * asin(sqrt(sin(radians((lat2-lat1)/2))^2 + cos(radians(lat1))*cos(radians(lat2))*sin(radians((lng2-lng1)/2))^2))
$$;

CREATE TABLE IF NOT EXISTS public.time_entry_geopoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_kind public.punch_event_kind NOT NULL,
  captured_at timestamptz NOT NULL,
  server_at timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  client_lat double precision,
  client_lng double precision,
  client_radius_m integer,
  distance_m double precision,
  geo_status public.geo_status NOT NULL,
  reason_code public.geo_reason_code NOT NULL,
  reason_text text,
  location_source public.location_source NOT NULL DEFAULT 'gps',
  geo_policy_version integer NOT NULL DEFAULT 1,
  device_fingerprint jsonb,
  mock_location_suspected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geopoints_time_entry ON public.time_entry_geopoints(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_geopoints_company ON public.time_entry_geopoints(company_id);
CREATE INDEX IF NOT EXISTS idx_geopoints_user ON public.time_entry_geopoints(user_id);

GRANT SELECT, INSERT ON public.time_entry_geopoints TO authenticated;
GRANT ALL ON public.time_entry_geopoints TO service_role;
ALTER TABLE public.time_entry_geopoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user insert own geopoints" ON public.time_entry_geopoints FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "managers insert company geopoints" ON public.time_entry_geopoints FOR INSERT TO authenticated
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "user view own geopoints" ON public.time_entry_geopoints FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "managers view company geopoints" ON public.time_entry_geopoints FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "super admin all geopoints" ON public.time_entry_geopoints FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_geopoints_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'time_entry_geopoints/photos are append-only (op=%)', TG_OP; END $$;

DROP TRIGGER IF EXISTS trg_geopoints_no_update ON public.time_entry_geopoints;
CREATE TRIGGER trg_geopoints_no_update BEFORE UPDATE ON public.time_entry_geopoints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_geopoints_append_only();
DROP TRIGGER IF EXISTS trg_geopoints_no_delete ON public.time_entry_geopoints;
CREATE TRIGGER trg_geopoints_no_delete BEFORE DELETE ON public.time_entry_geopoints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_geopoints_append_only();

CREATE TABLE IF NOT EXISTS public.time_entry_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_kind public.punch_event_kind NOT NULL,
  storage_path text NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entry_photos_event_kind_v1_chk CHECK (event_kind IN ('start','stop'))
);
CREATE INDEX IF NOT EXISTS idx_photos_time_entry ON public.time_entry_photos(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_photos_company ON public.time_entry_photos(company_id);

GRANT SELECT, INSERT ON public.time_entry_photos TO authenticated;
GRANT ALL ON public.time_entry_photos TO service_role;
ALTER TABLE public.time_entry_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user insert own photos" ON public.time_entry_photos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "user view own photos" ON public.time_entry_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "managers view company photos" ON public.time_entry_photos FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));
CREATE POLICY "super admin all photos" ON public.time_entry_photos FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_photos_no_update ON public.time_entry_photos;
CREATE TRIGGER trg_photos_no_update BEFORE UPDATE ON public.time_entry_photos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_geopoints_append_only();
DROP TRIGGER IF EXISTS trg_photos_no_delete ON public.time_entry_photos;
CREATE TRIGGER trg_photos_no_delete BEFORE DELETE ON public.time_entry_photos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_geopoints_append_only();
