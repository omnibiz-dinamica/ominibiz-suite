-- 1) Tabela de auditoria da operação
CREATE TABLE public.task_dedupe_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch text NOT NULL,
  kind text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.task_dedupe_audit TO authenticated;
GRANT ALL ON public.task_dedupe_audit TO service_role;

ALTER TABLE public.task_dedupe_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read dedupe audit"
ON public.task_dedupe_audit FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_task_dedupe_audit_batch ON public.task_dedupe_audit (batch, kind);

-- 2) Auditoria PRÉ-alteração: duplicatas (85)
INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'DUPLICATA_SOFT_DELETE', 'task', t.id,
       jsonb_build_object('company_id', t.company_id, 'title', t.title, 'status', t.status,
                          'recurrence_id', t.recurrence_id, 'recurrence_date', t.recurrence_date,
                          'scheduled_for', t.scheduled_for, 'assigned_to', t.assigned_to, 'client_id', t.client_id)
FROM public.tasks t
WHERE t.id IN ('000ef871-3e61-4da6-b70b-1c1c832a2c3c','02944158-f8dc-4ee2-aa80-576eb69795da','044233d0-8c2b-4e6e-af8d-54019254bda5','07e7e665-2400-43a8-91af-805cf63669d2','08412f7c-429d-4957-aa57-704fcec4c011','095013fc-ea51-4093-8cc4-402917ab29ae','0df1759a-d923-4545-bf8d-f240bb62d277','10a605d4-21b4-4cfe-bf51-22d65e474cae','14d1c0bd-0742-45e4-99f9-807f11062510','194d61de-dc7f-4485-bbd0-db0f8c785217','1b9c4ffd-9b9f-4a83-bd41-e2cd3b959224','1e131ed5-f2d1-4b41-816a-8bf2ab57a6ab','1e6a8d36-1532-4fb6-9d59-9aded590e730','23cdbfc1-a597-435f-ac3c-40b404041847','2aa955ea-9bae-4400-b3bb-1fac75a21d20','2c992f2b-7ccc-403b-b5b3-33f200fbb981','2d88e1b7-3dbe-4a62-b817-fd9811c61cae','2fa877fc-5cd5-412d-b4dd-3fc40d37462c','30d3423b-4ae9-4b41-9729-ea4c07a16d96','3367208f-a4b3-48b2-b113-f255ee7f5c88','380b809a-2c2b-401e-96d5-595a8d6c9d0b','3b280616-0627-48d8-b95d-b0afe65cb7bf','45880246-efbc-40d3-ac0e-90d2ea77c9ef','4a8e0810-1403-4f7e-b817-eaced8a533a9','4b5f6c1b-1ef5-45d1-9f7c-ad3de83d3257','4c3ea4dd-b724-4893-8363-767fbda73ff2','5417944c-64c2-4e1c-9f7c-ae91da06ab29','5d61a1a7-ab2e-4878-ae65-14ffc2e0bbd3','5f0ea508-7932-43ed-a087-d3d227f22cd9','5f40116d-543e-412d-92b6-4106c72e2118','611f2220-1c79-46e0-8ee0-47b996b6986c','643fd3f8-1541-491a-906e-ea9388c3ed25','6849008b-2ff5-4c31-a99a-156e8dfe3695','69e08b7b-9258-4710-a262-72bc8e1860d5','6ec97e62-890f-4ed3-ac09-c851cab6b6f7','71d35ae9-c116-4f06-8b60-a831bfcb51c7','737414e4-1892-4548-93b4-8edf438b1044','73d2ca53-bcd6-4865-9c4f-74c1e32e9269','78671626-2a45-437e-b1d3-628643d491e1','7cdc50f5-1ad8-4671-854b-20448c113dd4','7e18aca4-b549-408e-9a98-bdd98a32621d','8344daf4-e53e-4471-a3b6-dd645b1698ee','83488426-0300-4ae7-94f9-4d8c8bcef309','83bca8df-a4e7-454e-8beb-8cbd37871102','86894943-a6b6-4f9d-ba9f-6833d922b475','86bedcfd-cb2c-4d9d-a95f-3b04054c43bd','8917acc5-075f-467a-b8f5-c6713d52e906','8a3a0069-671e-4af7-9c42-0d69cd91a2f6','9391f61c-4662-45a2-bea0-56819aa77874','96816aa0-a111-4dc9-937f-ea8086ebba4f','97c052fd-8788-4f9e-8a52-056c69e22352','99f36018-af09-413a-90b3-87c9d26af45f','9abc62d9-c4fd-42f6-8ade-44856a2834bc','a098f084-f099-4581-8b8e-1afbc9914c46','a1c6fba5-05f7-43ee-9869-5ba392800034','a1f757a4-5bab-4241-959d-1e1e6d4a1c03','a2a1ebbf-9aa9-4cae-aa60-ffe0254112fe','a9096d31-ef3d-49b5-92d3-ed969ac7b046','a9748855-bfe2-464a-abc1-b23d5f8b75d2','ab81d510-8850-47d7-88b8-b120d5eb23c8','ac1fde58-a02c-45db-a347-fd7c79916eb9','b0804fd6-6bfa-430a-bc19-6a64519c202d','b2a65d82-4d0c-48ca-b5fc-4f9a53f2b7eb','b3893174-8120-4f58-a36c-420795f28672','b4945990-3cde-4a69-bac5-cf2fd7f71289','bbf62348-a56b-4bb9-a7db-fd6aa9d493ae','c1d3f64b-43b6-4482-8820-202715963de8','c61ea583-3d9f-496c-bc7e-4303a1986096','c9a5152f-3023-4dab-96c2-d30dc39a6d17','ccfb173f-1a3d-4604-aef4-80964b73a8d9','d097e221-b25f-48d9-99c8-8b6adeb7e786','d0d2f112-3b88-4f5b-ae4e-bf17d6e3368a','d6542b35-54a6-492d-b98c-cb29753c4ba9','d6c071d5-ba8d-4a80-b9ba-6cd0122714e0','e45c0517-0947-4ba9-9f44-6c171721dd71','e6ea22e4-a993-4022-922c-5d5504da7c8b','e71e002f-915c-4768-bc8b-c3cf7526a7cb','eb98ab13-e0b7-4444-8d68-fa67448bb08c','eca205e2-34e0-4a75-ab32-5fe764fe369f','ed94ff0e-171d-449b-9c5f-ffc676f0df5a','fac59e87-4d76-4776-ab22-72cf5df7a2c8','fb83c0db-61fe-4c13-9558-27b7c6b3c573','fc1d6cd9-b354-45c5-a43b-0d30d0f99147','fc549066-1920-48fe-9579-22aa7fb8e87c','fe97e20c-f385-4983-8cf0-a349b0fa4f63');

-- 2b) Auditoria PRÉ-alteração: revisão manual (2) — permanecem intactas
INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'REVISAO_MANUAL_INTACTA', 'task', t.id,
       jsonb_build_object('company_id', t.company_id, 'title', t.title, 'status', t.status, 'recurrence_id', t.recurrence_id)
FROM public.tasks t
WHERE t.id IN ('aefc40fd-8528-496d-8e7c-c4cccf4cd4e0','1c87f60c-98e1-4ac4-9c92-8bec0421a834');

-- 2c) Auditoria PRÉ-alteração: séries clone a encerrar (6)
INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'SERIE_CLONE_ENCERRADA', 'task_recurrence', r.id,
       jsonb_build_object('company_id', r.company_id, 'title', r.title, 'client_id', r.client_id,
                          'assigned_to', r.assigned_to, 'scheduled_time', r.scheduled_time,
                          'frequency', r.frequency, 'weekdays', r.weekdays, 'interval_weeks', r.interval_weeks,
                          'start_date', r.start_date, 'previous_status', r.status)
FROM public.task_recurrences r
WHERE r.id IN ('223058b8-aac6-4f2d-8100-67680f1de8d2','6655532b-de77-4e69-941a-996caa5ba5dc','973a2f1b-e845-4600-b122-64cd50d6a8c3','ded8346a-ce5e-4cfb-b324-25a284ab040a','e4580067-fd3c-41a4-bf59-ea4d36efa5a5','e8c72538-a3e7-4429-a531-516676170d42');

-- 2d) Auditoria PRÉ-alteração: tarefas principais preservadas + séries principais
INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'PRINCIPAL_PRESERVADA', 'task', t.id,
       jsonb_build_object('company_id', t.company_id, 'title', t.title, 'status', t.status, 'recurrence_id', t.recurrence_id)
FROM public.tasks t
WHERE t.recurrence_id IN ('9fcab59e-1967-46c5-b44d-a565bea38929','223058b8-aac6-4f2d-8100-67680f1de8d2','6655532b-de77-4e69-941a-996caa5ba5dc','973a2f1b-e845-4600-b122-64cd50d6a8c3','ded8346a-ce5e-4cfb-b324-25a284ab040a','e4580067-fd3c-41a4-bf59-ea4d36efa5a5','e8c72538-a3e7-4429-a531-516676170d42')
  AND t.deleted_at IS NULL
  AND t.id NOT IN ('000ef871-3e61-4da6-b70b-1c1c832a2c3c','02944158-f8dc-4ee2-aa80-576eb69795da','044233d0-8c2b-4e6e-af8d-54019254bda5','07e7e665-2400-43a8-91af-805cf63669d2','08412f7c-429d-4957-aa57-704fcec4c011','095013fc-ea51-4093-8cc4-402917ab29ae','0df1759a-d923-4545-bf8d-f240bb62d277','10a605d4-21b4-4cfe-bf51-22d65e474cae','14d1c0bd-0742-45e4-99f9-807f11062510','194d61de-dc7f-4485-bbd0-db0f8c785217','1b9c4ffd-9b9f-4a83-bd41-e2cd3b959224','1e131ed5-f2d1-4b41-816a-8bf2ab57a6ab','1e6a8d36-1532-4fb6-9d59-9aded590e730','23cdbfc1-a597-435f-ac3c-40b404041847','2aa955ea-9bae-4400-b3bb-1fac75a21d20','2c992f2b-7ccc-403b-b5b3-33f200fbb981','2d88e1b7-3dbe-4a62-b817-fd9811c61cae','2fa877fc-5cd5-412d-b4dd-3fc40d37462c','30d3423b-4ae9-4b41-9729-ea4c07a16d96','3367208f-a4b3-48b2-b113-f255ee7f5c88','380b809a-2c2b-401e-96d5-595a8d6c9d0b','3b280616-0627-48d8-b95d-b0afe65cb7bf','45880246-efbc-40d3-ac0e-90d2ea77c9ef','4a8e0810-1403-4f7e-b817-eaced8a533a9','4b5f6c1b-1ef5-45d1-9f7c-ad3de83d3257','4c3ea4dd-b724-4893-8363-767fbda73ff2','5417944c-64c2-4e1c-9f7c-ae91da06ab29','5d61a1a7-ab2e-4878-ae65-14ffc2e0bbd3','5f0ea508-7932-43ed-a087-d3d227f22cd9','5f40116d-543e-412d-92b6-4106c72e2118','611f2220-1c79-46e0-8ee0-47b996b6986c','643fd3f8-1541-491a-906e-ea9388c3ed25','6849008b-2ff5-4c31-a99a-156e8dfe3695','69e08b7b-9258-4710-a262-72bc8e1860d5','6ec97e62-890f-4ed3-ac09-c851cab6b6f7','71d35ae9-c116-4f06-8b60-a831bfcb51c7','737414e4-1892-4548-93b4-8edf438b1044','73d2ca53-bcd6-4865-9c4f-74c1e32e9269','78671626-2a45-437e-b1d3-628643d491e1','7cdc50f5-1ad8-4671-854b-20448c113dd4','7e18aca4-b549-408e-9a98-bdd98a32621d','8344daf4-e53e-4471-a3b6-dd645b1698ee','83488426-0300-4ae7-94f9-4d8c8bcef309','83bca8df-a4e7-454e-8beb-8cbd37871102','86894943-a6b6-4f9d-ba9f-6833d922b475','86bedcfd-cb2c-4d9d-a95f-3b04054c43bd','8917acc5-075f-467a-b8f5-c6713d52e906','8a3a0069-671e-4af7-9c42-0d69cd91a2f6','9391f61c-4662-45a2-bea0-56819aa77874','96816aa0-a111-4dc9-937f-ea8086ebba4f','97c052fd-8788-4f9e-8a52-056c69e22352','99f36018-af09-413a-90b3-87c9d26af45f','9abc62d9-c4fd-42f6-8ade-44856a2834bc','a098f084-f099-4581-8b8e-1afbc9914c46','a1c6fba5-05f7-43ee-9869-5ba392800034','a1f757a4-5bab-4241-959d-1e1e6d4a1c03','a2a1ebbf-9aa9-4cae-aa60-ffe0254112fe','a9096d31-ef3d-49b5-92d3-ed969ac7b046','a9748855-bfe2-464a-abc1-b23d5f8b75d2','ab81d510-8850-47d7-88b8-b120d5eb23c8','ac1fde58-a02c-45db-a347-fd7c79916eb9','b0804fd6-6bfa-430a-bc19-6a64519c202d','b2a65d82-4d0c-48ca-b5fc-4f9a53f2b7eb','b3893174-8120-4f58-a36c-420795f28672','b4945990-3cde-4a69-bac5-cf2fd7f71289','bbf62348-a56b-4bb9-a7db-fd6aa9d493ae','c1d3f64b-43b6-4482-8820-202715963de8','c61ea583-3d9f-496c-bc7e-4303a1986096','c9a5152f-3023-4dab-96c2-d30dc39a6d17','ccfb173f-1a3d-4604-aef4-80964b73a8d9','d097e221-b25f-48d9-99c8-8b6adeb7e786','d0d2f112-3b88-4f5b-ae4e-bf17d6e3368a','d6542b35-54a6-492d-b98c-cb29753c4ba9','d6c071d5-ba8d-4a80-b9ba-6cd0122714e0','e45c0517-0947-4ba9-9f44-6c171721dd71','e6ea22e4-a993-4022-922c-5d5504da7c8b','e71e002f-915c-4768-bc8b-c3cf7526a7cb','eb98ab13-e0b7-4444-8d68-fa67448bb08c','eca205e2-34e0-4a75-ab32-5fe764fe369f','ed94ff0e-171d-449b-9c5f-ffc676f0df5a','fac59e87-4d76-4776-ab22-72cf5df7a2c8','fb83c0db-61fe-4c13-9558-27b7c6b3c573','fc1d6cd9-b354-45c5-a43b-0d30d0f99147','fc549066-1920-48fe-9579-22aa7fb8e87c','fe97e20c-f385-4983-8cf0-a349b0fa4f63','aefc40fd-8528-496d-8e7c-c4cccf4cd4e0','1c87f60c-98e1-4ac4-9c92-8bec0421a834');

INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'SERIE_PRINCIPAL_PRESERVADA', 'task_recurrence', r.id,
       jsonb_build_object('company_id', r.company_id, 'title', r.title, 'status', r.status)
FROM public.task_recurrences r
WHERE r.id = '9fcab59e-1967-46c5-b44d-a565bea38929';

-- 3) Soft-delete reversível apenas das duplicatas ainda elegíveis (sem histórico operacional)
UPDATE public.tasks t
SET deleted_at = now(), updated_at = now()
WHERE t.id IN (SELECT entity_id FROM public.task_dedupe_audit WHERE batch='ADR-041' AND kind='DUPLICATA_SOFT_DELETE')
  AND t.deleted_at IS NULL
  AND t.status = 'pendente'
  AND NOT EXISTS (SELECT 1 FROM public.time_entries te WHERE te.task_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.task_documents d WHERE d.task_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.task_refusals rf WHERE rf.task_id = t.id);

-- 3b) Reclassificar como revisão manual qualquer duplicata que já não cumpria os critérios
INSERT INTO public.task_dedupe_audit (batch, kind, entity, entity_id, details)
SELECT 'ADR-041', 'RECLASSIFICADA_REVISAO_MANUAL', 'task', t.id,
       jsonb_build_object('motivo', 'nao cumpria criterios EXCLUIR_SEGURO no momento da execucao', 'status', t.status)
FROM public.tasks t
WHERE t.id IN (SELECT entity_id FROM public.task_dedupe_audit WHERE batch='ADR-041' AND kind='DUPLICATA_SOFT_DELETE')
  AND t.deleted_at IS NULL;

-- 4) Encerrar as 6 séries clone (série principal preservada)
UPDATE public.task_recurrences
SET status = 'ended',
    ended_reason = 'Serie duplicada encerrada na limpeza controlada P0 (ADR-041)',
    ended_at = now(),
    updated_at = now()
WHERE id IN ('223058b8-aac6-4f2d-8100-67680f1de8d2','6655532b-de77-4e69-941a-996caa5ba5dc','973a2f1b-e845-4600-b122-64cd50d6a8c3','ded8346a-ce5e-4cfb-b324-25a284ab040a','e4580067-fd3c-41a4-bf59-ea4d36efa5a5','e8c72538-a3e7-4429-a531-516676170d42')
  AND status <> 'ended';

-- 5) Proteção na origem: chave canónica de série ativa
CREATE OR REPLACE FUNCTION public.task_recurrences_canonical_key(
  _company_id uuid, _title text, _client_id uuid, _assigned_to uuid,
  _scheduled_time time, _frequency recurrence_frequency, _weekdays int[],
  _interval_weeks smallint, _monthly_rule jsonb, _start_date date, _end_date date
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT concat_ws('|', _company_id::text, lower(btrim(coalesce(_title,''))),
    coalesce(_client_id::text,'-'), coalesce(_assigned_to::text,'-'),
    coalesce(_scheduled_time::text,'-'), _frequency::text,
    coalesce(array_to_string(_weekdays, ','), '-'), coalesce(_interval_weeks,1)::text,
    coalesce(_monthly_rule::text,'-'), _start_date::text, coalesce(_end_date::text,'-'))
$$;

CREATE OR REPLACE FUNCTION public.task_recurrences_block_duplicate_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT r.id INTO v_existing
  FROM public.task_recurrences r
  WHERE r.status = 'active'
    AND r.id <> NEW.id
    AND public.task_recurrences_canonical_key(r.company_id, r.title, r.client_id, r.assigned_to,
          r.scheduled_time, r.frequency, r.weekdays, r.interval_weeks, r.monthly_rule, r.start_date, r.end_date)
      = public.task_recurrences_canonical_key(NEW.company_id, NEW.title, NEW.client_id, NEW.assigned_to,
          NEW.scheduled_time, NEW.frequency, NEW.weekdays, NEW.interval_weeks, NEW.monthly_rule, NEW.start_date, NEW.end_date)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'RECURRENCE_DUPLICATE_ACTIVE: %', v_existing
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_recurrences_block_duplicate_active ON public.task_recurrences;
CREATE TRIGGER trg_task_recurrences_block_duplicate_active
BEFORE INSERT OR UPDATE OF status, title, client_id, assigned_to, scheduled_time, frequency, weekdays, interval_weeks, monthly_rule, start_date, end_date
ON public.task_recurrences
FOR EACH ROW EXECUTE FUNCTION public.task_recurrences_block_duplicate_active();