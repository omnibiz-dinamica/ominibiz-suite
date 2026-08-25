-- Fechamento Mensal da Folha de Ponto (ADR-038) — parte 1: tipos.
-- Valores de enum têm de ser adicionados numa migration separada do seu uso.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'timesheet_report_available';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'timesheet_employee_signed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'timesheet_correction_requested';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'timesheet_manager_closed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'timesheet_sent_to_accounting';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_status') THEN
    CREATE TYPE public.timesheet_status AS ENUM (
      'em_aberto',
      'aguardando_funcionario',
      'aguardando_correcao',
      'assinado_funcionario',
      'em_conferencia',
      'fechado_gestor',
      'disponivel_contabilidade'
    );
  END IF;
END $$;