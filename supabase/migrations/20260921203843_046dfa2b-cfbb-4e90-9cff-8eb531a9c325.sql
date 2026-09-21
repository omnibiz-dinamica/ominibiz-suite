CREATE TYPE public.vacation_manager_queue_state AS ENUM ('pending', 'in_progress', 'resolved');

CREATE TABLE public.vacation_manager_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_request_id uuid NOT NULL UNIQUE REFERENCES public.vacation_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  state public.vacation_manager_queue_state NOT NULL DEFAULT 'pending',
  claimed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacation_manager_queue_claim_consistency CHECK (
    (state = 'pending' AND claimed_by IS NULL AND claimed_at IS NULL AND resolved_at IS NULL)
    OR (state = 'in_progress' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND resolved_at IS NULL)
    OR (state = 'resolved' AND resolved_at IS NOT NULL)
  )
);

GRANT SELECT ON public.vacation_manager_queue TO authenticated;
GRANT ALL ON public.vacation_manager_queue TO service_role;

ALTER TABLE public.vacation_manager_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers view shared vacation queue"
ON public.vacation_manager_queue
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.company_id = vacation_manager_queue.company_id
      AND ur.role = 'manager'
      AND (
        vacation_manager_queue.state = 'pending'
        OR vacation_manager_queue.claimed_by = auth.uid()
      )
  )
);

CREATE INDEX vacation_manager_queue_company_state_idx
  ON public.vacation_manager_queue(company_id, state, created_at DESC);
CREATE INDEX vacation_manager_queue_claimed_idx
  ON public.vacation_manager_queue(claimed_by, state, created_at DESC)
  WHERE claimed_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vacation_manager_queue_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER vacation_manager_queue_touch_trg
BEFORE UPDATE ON public.vacation_manager_queue
FOR EACH ROW EXECUTE FUNCTION public.vacation_manager_queue_touch();

CREATE OR REPLACE FUNCTION public.vacation_manager_queue_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' THEN
    INSERT INTO public.vacation_manager_queue(vacation_request_id, company_id)
    VALUES (NEW.id, NEW.company_id)
    ON CONFLICT (vacation_request_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'pendente'
    AND NEW.status <> 'pendente' THEN
    UPDATE public.vacation_manager_queue
       SET state = 'resolved', resolved_at = COALESCE(resolved_at, now())
     WHERE vacation_request_id = NEW.id
       AND state <> 'resolved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vacation_manager_queue_sync_trg
AFTER INSERT OR UPDATE OF status ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_manager_queue_sync();

CREATE OR REPLACE FUNCTION public.vacation_manager_queue_claim(_queue_id uuid)
RETURNS public.vacation_manager_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vacation_manager_queue%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_row
  FROM public.vacation_manager_queue
  WHERE id = _queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.company_id = v_row.company_id
        AND ur.role = 'manager'
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para assumir este pedido';
  END IF;

  IF v_row.state = 'resolved' THEN
    RAISE EXCEPTION 'Este pedido já foi resolvido';
  END IF;

  IF v_row.state = 'in_progress' AND v_row.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Este pedido já foi assumido por outro gestor';
  END IF;

  IF v_row.state = 'pending' THEN
    UPDATE public.vacation_manager_queue
       SET state = 'in_progress', claimed_by = v_uid, claimed_at = now()
     WHERE id = _queue_id
       AND state = 'pending'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este pedido já foi assumido por outro gestor';
    END IF;

    INSERT INTO public.vacation_audit(
      vacation_request_id, company_id, actor_id, action,
      from_status, to_status, source, metadata
    ) VALUES (
      v_row.vacation_request_id, v_row.company_id, v_uid, 'assumir_gestao',
      NULL, NULL, 'vacation_manager_queue',
      jsonb_build_object('queue_id', v_row.id, 'claimed_at', v_row.claimed_at)
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vacation_manager_queue_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vacation_manager_queue_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vacation_manager_queue_claim(uuid) TO service_role;

INSERT INTO public.vacation_manager_queue(vacation_request_id, company_id, created_at)
SELECT vr.id, vr.company_id, vr.created_at
FROM public.vacation_requests vr
WHERE vr.status = 'pendente'
ON CONFLICT (vacation_request_id) DO NOTHING;