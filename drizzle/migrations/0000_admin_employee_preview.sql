CREATE TABLE public.admin_preview_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  company_id uuid,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_preview_logs TO authenticated;
GRANT ALL ON public.admin_preview_logs TO service_role;
ALTER TABLE public.admin_preview_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read preview logs" ON public.admin_preview_logs
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_preview_employee(_target_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _res jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT current_company_id INTO _company FROM profiles WHERE id = _target_employee_id;
  INSERT INTO admin_preview_logs(admin_id, target_user_id, company_id)
  VALUES (auth.uid(), _target_employee_id, _company);
  SELECT jsonb_build_object(
    'profile', (SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'company_id', p.current_company_id) FROM profiles p WHERE p.id = _target_employee_id),
    'tasks', COALESCE((SELECT jsonb_agg(t ORDER BY t.scheduled_for NULLS LAST, t.recurrence_date NULLS LAST) FROM (
       SELECT tk.id, tk.title, tk.status, tk.scheduled_for, tk.scheduled_end, tk.recurrence_date, tk.due_at,
              c.name AS client_name
       FROM tasks tk LEFT JOIN clients c ON c.id = tk.client_id
       WHERE tk.assigned_to = _target_employee_id AND tk.deleted_at IS NULL AND tk.archived_at IS NULL
         AND tk.status IN ('pendente','autorizado','em_andamento')
       ORDER BY tk.scheduled_for NULLS LAST, tk.recurrence_date NULLS LAST LIMIT 20) t), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;
REVOKE ALL ON FUNCTION public.admin_preview_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_employee(uuid) TO authenticated;