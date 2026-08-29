-- SUP-2026-000080 — garante que uma falta válida tenha período mensal disponível.
-- A falta continua canônica em tasks e no snapshot; nenhum time_entry é criado.
-- Períodos já existentes, inclusive versões assinadas, não são alterados.

CREATE OR REPLACE FUNCTION public.timesheet_materialize_absence_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occurrence_date date;
BEGIN
  IF NEW.status <> 'ausente' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mesma data canônica usada pelo snapshot mensal, incluindo ocorrências recorrentes.
  v_occurrence_date := COALESCE(
    NEW.recurrence_date,
    NEW.scheduled_for::date,
    NEW.due_at::date
  );
  IF v_occurrence_date IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.timesheet_periods (
    company_id, employee_id, period_year, period_month, status
  ) VALUES (
    NEW.company_id,
    NEW.assigned_to,
    EXTRACT(YEAR FROM v_occurrence_date)::integer,
    EXTRACT(MONTH FROM v_occurrence_date)::integer,
    'aguardando_funcionario'::public.timesheet_status
  )
  ON CONFLICT (company_id, employee_id, period_year, period_month) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.timesheet_materialize_absence_period() FROM PUBLIC, anon;

-- Repara somente períodos derivados que nunca foram materializados para faltas
-- já existentes. Não altera a tarefa nem cria ponto/horas artificiais.
INSERT INTO public.timesheet_periods (
  company_id, employee_id, period_year, period_month, status
)
SELECT DISTINCT
  t.company_id,
  t.assigned_to,
  EXTRACT(YEAR FROM COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date))::integer,
  EXTRACT(MONTH FROM COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date))::integer,
  'aguardando_funcionario'::public.timesheet_status
FROM public.tasks t
WHERE t.status = 'ausente'
  AND t.assigned_to IS NOT NULL
  AND t.deleted_at IS NULL
  AND COALESCE(t.recurrence_date, t.scheduled_for::date, t.due_at::date) IS NOT NULL
ON CONFLICT (company_id, employee_id, period_year, period_month) DO NOTHING;

DROP TRIGGER IF EXISTS timesheet_materialize_absence_period ON public.tasks;
CREATE TRIGGER timesheet_materialize_absence_period
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  WHEN (NEW.status = 'ausente' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.timesheet_materialize_absence_period();
