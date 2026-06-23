
CREATE OR REPLACE FUNCTION public.touch_updated_at_employee_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
