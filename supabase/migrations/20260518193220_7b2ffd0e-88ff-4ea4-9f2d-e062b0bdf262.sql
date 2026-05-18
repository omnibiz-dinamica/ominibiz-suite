
-- =========================================================
-- Tabela time_entries (folha de ponto vinculada à tarefa)
-- =========================================================
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  effective_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_user_open
  ON public.time_entries(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_time_entries_task ON public.time_entries(task_id);
CREATE INDEX idx_time_entries_company ON public.time_entries(company_id);

-- Apenas UM ponto aberto por usuário (regra central no banco)
CREATE UNIQUE INDEX uniq_open_punch_per_user
  ON public.time_entries(user_id) WHERE ended_at IS NULL;

CREATE TRIGGER trg_time_entries_updated
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user view own punches" ON public.time_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "managers view company punches" ON public.time_entries
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));

CREATE POLICY "super admin all punches" ON public.time_entries
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Escrita só via RPCs SECURITY DEFINER. Nenhum INSERT/UPDATE/DELETE direto.

-- Realtime para sincronização visual
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;

-- =========================================================
-- Estende task_transition: abre/fecha ponto automaticamente
-- =========================================================
CREATE OR REPLACE FUNCTION public.task_transition(_task_id uuid, _action text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_uid UUID := auth.uid();
  v_is_manager BOOLEAN;
  v_is_assignee BOOLEAN;
  v_open_id UUID;
  v_punch_user UUID;
  v_started TIMESTAMPTZ;
  v_paused TIMESTAMPTZ;
  v_resumed TIMESTAMPTZ;
  v_pause_minutes INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  v_is_manager := public.is_company_manager(v_uid, v_task.company_id);
  v_is_assignee := (v_task.assigned_to = v_uid);

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Sem permissão para esta tarefa';
  END IF;

  IF _action = 'autorizar' THEN
    IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode autorizar'; END IF;
    IF v_task.status <> 'pendente' THEN RAISE EXCEPTION 'Só é possível autorizar tarefa pendente'; END IF;
    UPDATE public.tasks SET status = 'autorizado', authorized_at = now(), authorized_by = v_uid
      WHERE id = _task_id RETURNING * INTO v_task;

  ELSIF _action = 'iniciar' THEN
    IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF v_task.status NOT IN ('pendente','autorizado') THEN
      RAISE EXCEPTION 'Tarefa não pode ser iniciada no status atual: %', v_task.status;
    END IF;
    IF v_task.assigned_to IS NULL THEN
      RAISE EXCEPTION 'Tarefa precisa de um responsável antes de iniciar';
    END IF;

    -- Regra: nenhuma outra tarefa ativa para o usuário responsável
    v_punch_user := v_task.assigned_to;
    SELECT id INTO v_open_id FROM public.time_entries
     WHERE user_id = v_punch_user AND ended_at IS NULL
     LIMIT 1;
    IF v_open_id IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe um ponto aberto para este usuário. Conclua-o antes de iniciar outra tarefa.';
    END IF;

    UPDATE public.tasks SET status = 'em_andamento', started_at = COALESCE(started_at, now())
      WHERE id = _task_id RETURNING * INTO v_task;

    INSERT INTO public.time_entries (company_id, task_id, user_id, started_at)
    VALUES (v_task.company_id, v_task.id, v_punch_user, now());

  ELSIF _action IN ('concluir','cancelar','marcar_ausente') THEN
    -- Validações específicas
    IF _action = 'concluir' THEN
      IF NOT v_is_assignee AND NOT v_is_manager THEN RAISE EXCEPTION 'Sem permissão'; END IF;
      IF v_task.status <> 'em_andamento' THEN
        RAISE EXCEPTION 'Apenas tarefa em andamento pode ser concluída';
      END IF;
      UPDATE public.tasks SET status = 'concluido', completed_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSIF _action = 'cancelar' THEN
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode cancelar'; END IF;
      IF v_task.status IN ('concluido','cancelado','ausente') THEN
        RAISE EXCEPTION 'Tarefa já finalizada';
      END IF;
      UPDATE public.tasks SET status = 'cancelado', cancelled_at = now(), cancelled_by = v_uid
        WHERE id = _task_id RETURNING * INTO v_task;
    ELSE -- marcar_ausente
      IF NOT v_is_manager THEN RAISE EXCEPTION 'Apenas gestor pode marcar ausência'; END IF;
      IF v_task.status NOT IN ('pendente','autorizado') THEN
        RAISE EXCEPTION 'Apenas tarefa pendente/autorizada pode virar ausente';
      END IF;
      UPDATE public.tasks SET status = 'ausente', marked_absent_at = now()
        WHERE id = _task_id RETURNING * INTO v_task;
    END IF;

    -- Encerra qualquer ponto aberto vinculado a esta tarefa
    FOR v_open_id, v_started, v_paused, v_resumed IN
      SELECT id, started_at, paused_at, resumed_at
        FROM public.time_entries
       WHERE task_id = v_task.id AND ended_at IS NULL
    LOOP
      -- Se ainda pausado, considera retomado agora (pausa contada até agora)
      v_pause_minutes := 0;
      IF v_paused IS NOT NULL AND v_resumed IS NULL THEN
        v_pause_minutes := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_paused))/60)::INT;
      ELSIF v_paused IS NOT NULL AND v_resumed IS NOT NULL THEN
        v_pause_minutes := GREATEST(0, EXTRACT(EPOCH FROM (v_resumed - v_paused))/60)::INT;
      END IF;

      UPDATE public.time_entries
         SET ended_at = now(),
             resumed_at = COALESCE(resumed_at, CASE WHEN paused_at IS NOT NULL THEN now() ELSE NULL END),
             effective_minutes = GREATEST(0,
               EXTRACT(EPOCH FROM (now() - v_started))/60)::INT - v_pause_minutes
       WHERE id = v_open_id;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', _action;
  END IF;

  RETURN v_task;
END $function$;

-- =========================================================
-- Pausa / Retomada do ponto (almoço, intervalo)
-- =========================================================
CREATE OR REPLACE FUNCTION public.punch_pause(_note text DEFAULT NULL)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_entry public.time_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_entry FROM public.time_entries
   WHERE user_id = v_uid AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum ponto aberto para pausar'; END IF;
  IF v_entry.paused_at IS NOT NULL AND v_entry.resumed_at IS NULL THEN
    RAISE EXCEPTION 'Ponto já está pausado';
  END IF;
  IF v_entry.paused_at IS NOT NULL AND v_entry.resumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este ponto já teve uma pausa registrada';
  END IF;

  UPDATE public.time_entries
     SET paused_at = now(),
         notes = COALESCE(notes, '') || CASE WHEN _note IS NOT NULL THEN E'\n[pausa] ' || _note ELSE '' END
   WHERE id = v_entry.id RETURNING * INTO v_entry;
  RETURN v_entry;
END $function$;

CREATE OR REPLACE FUNCTION public.punch_resume()
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_entry public.time_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_entry FROM public.time_entries
   WHERE user_id = v_uid AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum ponto aberto'; END IF;
  IF v_entry.paused_at IS NULL THEN RAISE EXCEPTION 'Ponto não está pausado'; END IF;
  IF v_entry.resumed_at IS NOT NULL THEN RAISE EXCEPTION 'Pausa já foi retomada'; END IF;

  UPDATE public.time_entries SET resumed_at = now()
   WHERE id = v_entry.id RETURNING * INTO v_entry;
  RETURN v_entry;
END $function$;
