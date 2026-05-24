
-- ============= 1. PUNCH MODE =============
DO $$ BEGIN
  CREATE TYPE public.punch_mode AS ENUM ('automatico','manual','ambos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.company_hr_settings
  ADD COLUMN IF NOT EXISTS default_punch_mode public.punch_mode NOT NULL DEFAULT 'automatico';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS punch_mode_override public.punch_mode;

-- Resolve effective punch mode for a task
CREATE OR REPLACE FUNCTION public.task_effective_punch_mode(_task_id uuid)
RETURNS public.punch_mode
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    t.punch_mode_override,
    s.default_punch_mode,
    'automatico'::public.punch_mode
  )
  FROM public.tasks t
  LEFT JOIN public.company_hr_settings s ON s.company_id = t.company_id
  WHERE t.id = _task_id
$$;

-- Manual punch start: opens a time_entry without using task_transition's auto-open.
CREATE OR REPLACE FUNCTION public.punch_manual_start(_task_id uuid)
RETURNS public.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_open uuid;
  v_entry public.time_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF v_task.assigned_to <> v_uid AND NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_task.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'Tarefa finalizada';
  END IF;

  SELECT id INTO v_open FROM public.time_entries
   WHERE user_id = COALESCE(v_task.assigned_to, v_uid) AND ended_at IS NULL LIMIT 1;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um ponto aberto. Conclua-o antes.';
  END IF;

  IF v_task.status IN ('pendente','autorizado') THEN
    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
     WHERE id = _task_id;
  END IF;

  INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
  VALUES (v_task.company_id, v_task.id, COALESCE(v_task.assigned_to, v_uid), now())
  RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;

-- Manual punch end: closes the open time_entry for this task (does NOT complete the task).
CREATE OR REPLACE FUNCTION public.punch_manual_end(_task_id uuid)
RETURNS public.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_entry public.time_entries%ROWTYPE;
  v_pause_minutes int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF v_task.assigned_to <> v_uid AND NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO v_entry FROM public.time_entries
   WHERE task_id = _task_id AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum ponto aberto para esta tarefa'; END IF;

  IF v_entry.paused_at IS NOT NULL AND v_entry.resumed_at IS NULL THEN
    v_pause_minutes := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_entry.paused_at))/60)::int;
  ELSIF v_entry.paused_at IS NOT NULL THEN
    v_pause_minutes := GREATEST(0, EXTRACT(EPOCH FROM (v_entry.resumed_at - v_entry.paused_at))/60)::int;
  END IF;

  UPDATE public.time_entries
     SET ended_at = now(),
         resumed_at = COALESCE(resumed_at, CASE WHEN paused_at IS NOT NULL THEN now() ELSE NULL END),
         effective_minutes = GREATEST(0, EXTRACT(EPOCH FROM (now() - v_entry.started_at))/60)::int - v_pause_minutes
   WHERE id = v_entry.id
   RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;

-- ============= 2. TASK DOCUMENTS =============
DO $$ BEGIN
  CREATE TYPE public.task_document_kind AS ENUM ('pdf','image','checklist','video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.task_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  company_id uuid NOT NULL,
  uploaded_by uuid,
  kind public.task_document_kind NOT NULL DEFAULT 'pdf',
  title text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_documents_task ON public.task_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_task_documents_company ON public.task_documents(company_id);

ALTER TABLE public.task_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage task docs" ON public.task_documents;
CREATE POLICY "managers manage task docs" ON public.task_documents
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "assignees view task docs" ON public.task_documents;
CREATE POLICY "assignees view task docs" ON public.task_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_documents.task_id AND t.assigned_to = auth.uid()));

DROP POLICY IF EXISTS "super admin task docs" ON public.task_documents;
CREATE POLICY "super admin task docs" ON public.task_documents
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-docs','task-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <company_id>/<task_id>/<filename>
DROP POLICY IF EXISTS "task-docs managers all" ON storage.objects;
CREATE POLICY "task-docs managers all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'task-docs'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'task-docs'
    AND public.is_company_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "task-docs assignees read" ON storage.objects;
CREATE POLICY "task-docs assignees read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-docs'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = ((storage.foldername(name))[2])::uuid
        AND t.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task-docs super admin" ON storage.objects;
CREATE POLICY "task-docs super admin" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'task-docs' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'task-docs' AND public.is_super_admin(auth.uid()));

-- ============= 3. TASK RECURRENCES =============
DO $$ BEGIN
  CREATE TYPE public.recurrence_frequency AS ENUM ('daily','weekly','monthly','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.recurrence_status AS ENUM ('active','paused','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.task_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  client_id uuid,
  priority text NOT NULL DEFAULT 'media',
  location text,
  scheduled_time time NOT NULL DEFAULT '09:00',
  duration_minutes int NOT NULL DEFAULT 60,
  absence_grace_minutes int NOT NULL DEFAULT 15,
  punch_mode_override public.punch_mode,
  frequency public.recurrence_frequency NOT NULL,
  weekdays int[] NOT NULL DEFAULT '{}',          -- 0=Sun..6=Sat
  monthly_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_cron text,
  start_date date NOT NULL,
  end_date date,
  status public.recurrence_status NOT NULL DEFAULT 'active',
  ended_reason text,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurrences_company ON public.task_recurrences(company_id);
CREATE INDEX IF NOT EXISTS idx_recurrences_assigned ON public.task_recurrences(assigned_to);
CREATE INDEX IF NOT EXISTS idx_recurrences_status ON public.task_recurrences(status);

DROP TRIGGER IF EXISTS trg_recurrences_touch ON public.task_recurrences;
CREATE TRIGGER trg_recurrences_touch BEFORE UPDATE ON public.task_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.task_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage recurrences" ON public.task_recurrences;
CREATE POLICY "managers manage recurrences" ON public.task_recurrences
  FOR ALL TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id))
  WITH CHECK (public.is_company_manager(auth.uid(), company_id));

DROP POLICY IF EXISTS "members view own recurrences" ON public.task_recurrences;
CREATE POLICY "members view own recurrences" ON public.task_recurrences
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS "super admin recurrences" ON public.task_recurrences;
CREATE POLICY "super admin recurrences" ON public.task_recurrences
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_id uuid,
  ADD COLUMN IF NOT EXISTS recurrence_date date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_recurrence_date
  ON public.tasks(recurrence_id, recurrence_date)
  WHERE recurrence_id IS NOT NULL AND recurrence_date IS NOT NULL;

-- Materialize occurrences from today up to N days ahead
CREATE OR REPLACE FUNCTION public.recurrence_materialize(_days_ahead int DEFAULT 14, _company_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_rec public.task_recurrences%ROWTYPE;
  v_day date;
  v_dow int;
  v_target timestamptz;
  v_end timestamptz;
  v_matches boolean;
  v_monthly_dom int;
BEGIN
  FOR v_rec IN
    SELECT * FROM public.task_recurrences
     WHERE status = 'active'
       AND (_company_id IS NULL OR company_id = _company_id)
       AND start_date <= (CURRENT_DATE + (_days_ahead || ' days')::interval)
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  LOOP
    FOR v_day IN
      SELECT generate_series(
        GREATEST(v_rec.start_date, CURRENT_DATE),
        LEAST(COALESCE(v_rec.end_date, CURRENT_DATE + (_days_ahead || ' days')::interval)::date,
              (CURRENT_DATE + (_days_ahead || ' days')::interval)::date),
        '1 day'::interval
      )::date
    LOOP
      v_dow := EXTRACT(DOW FROM v_day)::int;
      v_matches := false;

      IF v_rec.frequency = 'daily' THEN
        v_matches := true;
      ELSIF v_rec.frequency = 'weekly' THEN
        v_matches := v_dow = ANY(v_rec.weekdays);
      ELSIF v_rec.frequency = 'monthly' THEN
        v_monthly_dom := COALESCE((v_rec.monthly_rule->>'day_of_month')::int, EXTRACT(DAY FROM v_rec.start_date)::int);
        v_matches := EXTRACT(DAY FROM v_day)::int = v_monthly_dom;
      END IF;

      IF NOT v_matches THEN CONTINUE; END IF;

      v_target := (v_day::text || ' ' || v_rec.scheduled_time::text)::timestamptz;
      v_end := v_target + (v_rec.duration_minutes || ' minutes')::interval;

      INSERT INTO public.tasks (
        company_id, title, description, status, priority,
        assigned_to, created_by, client_id,
        scheduled_for, scheduled_end, absence_grace_minutes,
        location, punch_mode_override,
        recurrence_id, recurrence_date
      ) VALUES (
        v_rec.company_id, v_rec.title, v_rec.description, 'pendente',
        v_rec.priority::public.task_priority,
        v_rec.assigned_to, COALESCE(v_rec.created_by, v_rec.assigned_to), v_rec.client_id,
        v_target, v_end, v_rec.absence_grace_minutes,
        v_rec.location, v_rec.punch_mode_override,
        v_rec.id, v_day
      )
      ON CONFLICT (recurrence_id, recurrence_date) WHERE recurrence_id IS NOT NULL AND recurrence_date IS NOT NULL
      DO NOTHING;

      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END $$;

-- End a recurrence (and optionally cancel future occurrences)
CREATE OR REPLACE FUNCTION public.recurrence_end(_id uuid, _reason text, _cancel_future boolean DEFAULT true)
RETURNS public.task_recurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.task_recurrences%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.task_recurrences WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_rec.company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.task_recurrences
     SET status = 'ended', ended_reason = _reason, ended_at = now(), end_date = CURRENT_DATE
   WHERE id = _id
   RETURNING * INTO v_rec;

  IF _cancel_future THEN
    UPDATE public.tasks
       SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
     WHERE recurrence_id = _id
       AND status IN ('pendente','autorizado')
       AND scheduled_for > now();
  END IF;

  RETURN v_rec;
END $$;

-- Reassign with scope: this | future | all
CREATE OR REPLACE FUNCTION public.recurrence_reassign(_task_id uuid, _new_user uuid, _scope text DEFAULT 'this')
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_count int := 0;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;
  IF NOT public.is_company_manager(v_uid, v_task.company_id) THEN
    RAISE EXCEPTION 'Apenas gestor pode reatribuir';
  END IF;

  IF _scope = 'this' OR v_task.recurrence_id IS NULL THEN
    UPDATE public.tasks SET assigned_to = _new_user WHERE id = _task_id;
    RETURN 1;
  END IF;

  IF _scope = 'future' THEN
    UPDATE public.task_recurrences SET assigned_to = _new_user WHERE id = v_task.recurrence_id;
    UPDATE public.tasks SET assigned_to = _new_user
     WHERE recurrence_id = v_task.recurrence_id
       AND status IN ('pendente','autorizado')
       AND scheduled_for >= COALESCE(v_task.scheduled_for, now());
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;

  IF _scope = 'all' THEN
    UPDATE public.task_recurrences SET assigned_to = _new_user WHERE id = v_task.recurrence_id;
    UPDATE public.tasks SET assigned_to = _new_user
     WHERE recurrence_id = v_task.recurrence_id
       AND status IN ('pendente','autorizado');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;

  RAISE EXCEPTION 'Escopo inválido: %', _scope;
END $$;

-- Auto-end recurrences when employee is removed from company
CREATE OR REPLACE FUNCTION public.recurrences_on_role_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.task_recurrences
     SET status = 'ended', ended_reason = 'employee_offboarded',
         ended_at = now(), end_date = CURRENT_DATE
   WHERE assigned_to = OLD.user_id
     AND company_id = OLD.company_id
     AND status <> 'ended';
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_recurrences_offboard ON public.user_roles;
CREATE TRIGGER trg_recurrences_offboard AFTER DELETE ON public.user_roles
  FOR EACH ROW WHEN (OLD.company_id IS NOT NULL)
  EXECUTE FUNCTION public.recurrences_on_role_delete();
