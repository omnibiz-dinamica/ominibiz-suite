-- Enum de tipos de evento operacional
DO $$ BEGIN
  CREATE TYPE public.notification_event AS ENUM (
    'task_created',
    'task_assigned',
    'task_authorization_requested',
    'task_authorized',
    'task_rejected',
    'task_started',
    'task_completed',
    'task_cancelled',
    'task_marked_absent',
    'task_late'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_priority AS ENUM ('baixa','media','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coluna para evitar duplicidade de aviso de atraso
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS late_notified_at TIMESTAMPTZ;

-- Tabela central
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  event public.notification_event NOT NULL,
  priority public.notification_priority NOT NULL DEFAULT 'media',
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company
  ON public.notifications (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_task
  ON public.notifications (task_id);

-- Evita duplicidade do mesmo evento para o mesmo usuário/tarefa
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_event_per_user_task
  ON public.notifications (user_id, task_id, event)
  WHERE task_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Apenas o destinatário vê suas notificações
CREATE POLICY "user view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Gestores visualizam notificações da empresa (para auditoria)
CREATE POLICY "managers view company notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.is_company_manager(auth.uid(), company_id));

-- Super admin acesso total
CREATE POLICY "super admin all notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Destinatário pode marcar como lida (update read_at)
CREATE POLICY "user update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Nenhuma policy de INSERT pública: apenas funções SECURITY DEFINER inserem

-- Helper interno para inserir notificação (evita duplicidade silenciosamente)
CREATE OR REPLACE FUNCTION public._notify(
  _company_id UUID,
  _user_id UUID,
  _task_id UUID,
  _event public.notification_event,
  _title TEXT,
  _body TEXT,
  _priority public.notification_priority DEFAULT 'media',
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (company_id, user_id, task_id, event, title, body, priority, metadata)
  VALUES (_company_id, _user_id, _task_id, _event, _title, _body, _priority, _metadata)
  ON CONFLICT DO NOTHING;
END $$;

-- Trigger: tarefa criada
CREATE OR REPLACE FUNCTION public.tasks_notify_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mgr RECORD;
  v_prio public.notification_priority;
BEGIN
  v_prio := CASE NEW.priority::text
              WHEN 'urgente' THEN 'urgente'::public.notification_priority
              WHEN 'alta' THEN 'alta'::public.notification_priority
              WHEN 'baixa' THEN 'baixa'::public.notification_priority
              ELSE 'media'::public.notification_priority END;

  -- Notifica responsável (se houver e não for o criador)
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Nova tarefa atribuída', NEW.title, v_prio,
      jsonb_build_object('status', NEW.status));
  END IF;

  -- Se criada por funcionário (não gestor), notifica gestores como pedido de autorização
  IF NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = NEW.company_id AND role IN ('manager','super_admin')
    LOOP
      PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
        'task_authorization_requested', 'Solicitação de autorização',
        NEW.title, 'alta', jsonb_build_object('created_by', NEW.created_by));
    END LOOP;
  ELSE
    -- Criada por gestor: notifica demais gestores da empresa (exceto o autor)
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = NEW.company_id AND role = 'manager' AND user_id <> NEW.created_by
    LOOP
      PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
        'task_created', 'Nova tarefa criada', NEW.title, v_prio, '{}'::jsonb);
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_notify_insert ON public.tasks;
CREATE TRIGGER trg_tasks_notify_insert
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_notify_insert();

-- Trigger: mudanças relevantes em tarefa
CREATE OR REPLACE FUNCTION public.tasks_notify_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mgr RECORD;
BEGIN
  -- Reatribuição
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
      'task_assigned', 'Tarefa atribuída a você', NEW.title, 'media', '{}'::jsonb);
  END IF;

  -- Mudança de status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'autorizado' THEN
      PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
        'task_authorized', 'Tarefa autorizada', NEW.title, 'media',
        jsonb_build_object('authorized_by', NEW.authorized_by));
      IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.created_by THEN
        PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
          'task_authorized', 'Tarefa autorizada', NEW.title, 'media', '{}'::jsonb);
      END IF;

    ELSIF NEW.status = 'em_andamento' THEN
      -- Notifica gestores que a tarefa foi iniciada
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = NEW.company_id AND role = 'manager'
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_started', 'Tarefa iniciada', NEW.title, 'baixa', '{}'::jsonb);
      END LOOP;

    ELSIF NEW.status = 'concluido' THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = NEW.company_id AND role = 'manager'
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_completed', 'Tarefa concluída', NEW.title, 'media', '{}'::jsonb);
      END LOOP;
      IF NEW.created_by IS NOT NULL THEN
        PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
          'task_completed', 'Tarefa concluída', NEW.title, 'media', '{}'::jsonb);
      END IF;

    ELSIF NEW.status = 'cancelado' THEN
      -- Trata como "rejeitada" se estava pendente (era pedido de autorização)
      IF OLD.status = 'pendente' AND NOT public.is_company_manager(NEW.created_by, NEW.company_id) THEN
        PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
          'task_rejected', 'Solicitação rejeitada', NEW.title, 'alta',
          jsonb_build_object('rejected_by', NEW.cancelled_by));
      ELSE
        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
            'task_cancelled', 'Tarefa cancelada', NEW.title, 'media', '{}'::jsonb);
        END IF;
        IF NEW.created_by IS NOT NULL AND NEW.created_by <> COALESCE(NEW.assigned_to,'00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public._notify(NEW.company_id, NEW.created_by, NEW.id,
            'task_cancelled', 'Tarefa cancelada', NEW.title, 'media', '{}'::jsonb);
        END IF;
      END IF;

    ELSIF NEW.status = 'ausente' THEN
      FOR v_mgr IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE company_id = NEW.company_id AND role = 'manager'
      LOOP
        PERFORM public._notify(NEW.company_id, v_mgr.user_id, NEW.id,
          'task_marked_absent', 'Tarefa marcada como ausente', NEW.title, 'alta', '{}'::jsonb);
      END LOOP;
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public._notify(NEW.company_id, NEW.assigned_to, NEW.id,
          'task_marked_absent', 'Sua tarefa foi marcada como ausente', NEW.title, 'alta', '{}'::jsonb);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_notify_update ON public.tasks;
CREATE TRIGGER trg_tasks_notify_update
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_notify_update();

-- Sweep para tarefas atrasadas (sem virar ausente ainda)
CREATE OR REPLACE FUNCTION public.notifications_sweep_late(_company_id UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_task RECORD;
  v_mgr RECORD;
  v_count INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  FOR v_task IN
    SELECT t.* FROM public.tasks t
    WHERE t.status IN ('pendente','autorizado')
      AND t.scheduled_for IS NOT NULL
      AND t.scheduled_for < now()
      AND t.late_notified_at IS NULL
      AND (
        public.is_super_admin(v_uid)
        OR (_company_id IS NOT NULL AND t.company_id = _company_id AND public.is_company_manager(v_uid, t.company_id))
        OR (_company_id IS NULL AND public.is_company_manager(v_uid, t.company_id))
      )
  LOOP
    UPDATE public.tasks SET late_notified_at = now() WHERE id = v_task.id;

    IF v_task.assigned_to IS NOT NULL THEN
      PERFORM public._notify(v_task.company_id, v_task.assigned_to, v_task.id,
        'task_late', 'Tarefa atrasada', v_task.title, 'alta',
        jsonb_build_object('scheduled_for', v_task.scheduled_for));
    END IF;
    FOR v_mgr IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE company_id = v_task.company_id AND role = 'manager'
    LOOP
      PERFORM public._notify(v_task.company_id, v_mgr.user_id, v_task.id,
        'task_late', 'Tarefa atrasada', v_task.title, 'alta',
        jsonb_build_object('scheduled_for', v_task.scheduled_for));
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- Marcar como lida
CREATE OR REPLACE FUNCTION public.notification_mark_read(_id UUID DEFAULT NULL, _all BOOLEAN DEFAULT FALSE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _all THEN
    UPDATE public.notifications SET read_at = now()
     WHERE user_id = v_uid AND read_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    IF _id IS NULL THEN RAISE EXCEPTION 'id obrigatório'; END IF;
    UPDATE public.notifications SET read_at = now()
     WHERE id = _id AND user_id = v_uid AND read_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END $$;

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;