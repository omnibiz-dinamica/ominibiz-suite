
-- Branding white-label nas empresas
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS email_from_name TEXT;

-- Auditoria reforçada de emails
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

CREATE INDEX IF NOT EXISTS idx_email_send_log_company ON public.email_send_log(company_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_trigger ON public.email_send_log(trigger_source);
CREATE INDEX IF NOT EXISTS idx_email_send_log_template ON public.email_send_log(template_name);
