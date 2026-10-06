CREATE OR REPLACE FUNCTION public.admin_preview_employee_full(_target_employee_id uuid, _company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _res jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO admin_preview_logs(admin_id, target_user_id, company_id)
  VALUES (auth.uid(), _target_employee_id, _company_id);
  SELECT jsonb_build_object(
    'profile', (SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name) FROM profiles p WHERE p.id = _target_employee_id),
    'company', (SELECT jsonb_build_object('name', c.name, 'enabled_modules', c.enabled_modules) FROM companies c WHERE c.id = _company_id),
    'has_vehicle', EXISTS (SELECT 1 FROM vehicle_assignments v WHERE v.user_id = _target_employee_id),
    'tasks', COALESCE((SELECT jsonb_agg(t ORDER BY t.scheduled_for NULLS LAST, t.recurrence_date NULLS LAST) FROM (
       SELECT tk.id, tk.title, tk.status, tk.scheduled_for, tk.scheduled_end, tk.recurrence_date, tk.due_at, c.name AS client_name
       FROM tasks tk LEFT JOIN clients c ON c.id = tk.client_id
       WHERE tk.assigned_to = _target_employee_id AND tk.company_id = _company_id AND tk.deleted_at IS NULL AND tk.archived_at IS NULL
         AND tk.status IN ('pendente','autorizado','em_andamento')
       ORDER BY tk.scheduled_for NULLS LAST, tk.recurrence_date NULLS LAST LIMIT 60) t), '[]'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(t ORDER BY t.scheduled_for DESC NULLS LAST) FROM (
       SELECT tk.id, tk.title, tk.status, tk.scheduled_for, tk.scheduled_end, tk.recurrence_date, tk.due_at, c.name AS client_name
       FROM tasks tk LEFT JOIN clients c ON c.id = tk.client_id
       WHERE tk.assigned_to = _target_employee_id AND tk.company_id = _company_id AND tk.deleted_at IS NULL
         AND tk.status NOT IN ('pendente','autorizado','em_andamento')
       ORDER BY tk.scheduled_for DESC NULLS LAST LIMIT 30) t), '[]'::jsonb),
    'time_entries', COALESCE((SELECT jsonb_agg(e ORDER BY e.started_at DESC) FROM (
       SELECT te.id, te.started_at, te.ended_at, te.effective_minutes, tk.title AS task_title
       FROM time_entries te LEFT JOIN tasks tk ON tk.id = te.task_id
       WHERE te.user_id = _target_employee_id AND te.company_id = _company_id AND te.voided_at IS NULL
       ORDER BY te.started_at DESC LIMIT 30) e), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(n ORDER BY n.created_at DESC) FROM (
       SELECT id, title, body, created_at, read_at FROM notifications
       WHERE user_id = _target_employee_id AND company_id = _company_id
       ORDER BY created_at DESC LIMIT 30) n), '[]'::jsonb),
    'vacations', COALESCE((SELECT jsonb_agg(v ORDER BY v.start_date DESC) FROM (
       SELECT id, start_date, end_date, status, note FROM vacation_requests
       WHERE user_id = _target_employee_id AND company_id = _company_id
       ORDER BY start_date DESC LIMIT 20) v), '[]'::jsonb),
    'payslips', COALESCE((SELECT jsonb_agg(s ORDER BY s.period_year DESC, s.period_month DESC) FROM (
       SELECT id, period_year, period_month, net_amount, original_filename FROM payslips
       WHERE user_id = _target_employee_id AND company_id = _company_id
       ORDER BY period_year DESC, period_month DESC LIMIT 24) s), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;
REVOKE ALL ON FUNCTION public.admin_preview_employee_full(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_employee_full(uuid, uuid) TO authenticated;