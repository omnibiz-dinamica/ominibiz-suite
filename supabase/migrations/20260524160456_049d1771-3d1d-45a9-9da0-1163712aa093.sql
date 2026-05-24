
-- Idempotente: remove qualquer versão anterior e recria apontando para profiles/clients/companies.

-- tasks
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_client_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT tasks_created_by_fkey  FOREIGN KEY (created_by)  REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tasks_client_id_fkey   FOREIGN KEY (client_id)   REFERENCES public.clients(id)  ON DELETE SET NULL;

-- user_roles
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- time_entries
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_user_id_fkey;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- clients
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_company_id_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- client_assignees
ALTER TABLE public.client_assignees DROP CONSTRAINT IF EXISTS client_assignees_client_id_fkey;
ALTER TABLE public.client_assignees DROP CONSTRAINT IF EXISTS client_assignees_user_id_fkey;
ALTER TABLE public.client_assignees DROP CONSTRAINT IF EXISTS client_assignees_company_id_fkey;
ALTER TABLE public.client_assignees
  ADD CONSTRAINT client_assignees_client_id_fkey  FOREIGN KEY (client_id)  REFERENCES public.clients(id)   ON DELETE CASCADE,
  ADD CONSTRAINT client_assignees_user_id_fkey    FOREIGN KEY (user_id)    REFERENCES public.profiles(id)  ON DELETE CASCADE,
  ADD CONSTRAINT client_assignees_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- time_entry_valuations
ALTER TABLE public.time_entry_valuations DROP CONSTRAINT IF EXISTS time_entry_valuations_time_entry_id_fkey;
ALTER TABLE public.time_entry_valuations DROP CONSTRAINT IF EXISTS time_entry_valuations_company_id_fkey;
ALTER TABLE public.time_entry_valuations DROP CONSTRAINT IF EXISTS time_entry_valuations_user_id_fkey;
ALTER TABLE public.time_entry_valuations DROP CONSTRAINT IF EXISTS time_entry_valuations_client_id_fkey;
ALTER TABLE public.time_entry_valuations
  ADD CONSTRAINT time_entry_valuations_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE CASCADE,
  ADD CONSTRAINT time_entry_valuations_company_id_fkey    FOREIGN KEY (company_id)    REFERENCES public.companies(id)    ON DELETE CASCADE,
  ADD CONSTRAINT time_entry_valuations_user_id_fkey       FOREIGN KEY (user_id)       REFERENCES public.profiles(id)     ON DELETE RESTRICT,
  ADD CONSTRAINT time_entry_valuations_client_id_fkey     FOREIGN KEY (client_id)     REFERENCES public.clients(id)      ON DELETE SET NULL;

-- time_entries_audit
ALTER TABLE public.time_entries_audit DROP CONSTRAINT IF EXISTS time_entries_audit_time_entry_id_fkey;
ALTER TABLE public.time_entries_audit DROP CONSTRAINT IF EXISTS time_entries_audit_company_id_fkey;
ALTER TABLE public.time_entries_audit DROP CONSTRAINT IF EXISTS time_entries_audit_changed_by_fkey;
ALTER TABLE public.time_entries_audit
  ADD CONSTRAINT time_entries_audit_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE CASCADE,
  ADD CONSTRAINT time_entries_audit_company_id_fkey    FOREIGN KEY (company_id)    REFERENCES public.companies(id)    ON DELETE CASCADE,
  ADD CONSTRAINT time_entries_audit_changed_by_fkey    FOREIGN KEY (changed_by)    REFERENCES public.profiles(id)     ON DELETE RESTRICT;

-- task_documents
ALTER TABLE public.task_documents DROP CONSTRAINT IF EXISTS task_documents_task_id_fkey;
ALTER TABLE public.task_documents DROP CONSTRAINT IF EXISTS task_documents_company_id_fkey;
ALTER TABLE public.task_documents
  ADD CONSTRAINT task_documents_task_id_fkey    FOREIGN KEY (task_id)    REFERENCES public.tasks(id)     ON DELETE CASCADE,
  ADD CONSTRAINT task_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- financial_audit
ALTER TABLE public.financial_audit DROP CONSTRAINT IF EXISTS financial_audit_company_id_fkey;
ALTER TABLE public.financial_audit
  ADD CONSTRAINT financial_audit_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Índices de FK
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_client_assignees_client_id ON public.client_assignees(client_id);
CREATE INDEX IF NOT EXISTS idx_client_assignees_user_id ON public.client_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_valuations_time_entry_id ON public.time_entry_valuations(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_valuations_company_id ON public.time_entry_valuations(company_id);
CREATE INDEX IF NOT EXISTS idx_valuations_user_id ON public.time_entry_valuations(user_id);
CREATE INDEX IF NOT EXISTS idx_te_audit_time_entry_id ON public.time_entries_audit(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_task_documents_task_id ON public.task_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

NOTIFY pgrst, 'reload schema';
