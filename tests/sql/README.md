# Testes SQL das migrações de Lojas (sem Lovable, sem chaves)

Correm as migrações `0007` e `0008` num Postgres 16 local, com stubs mínimos do
Supabase/OmniBiz (`auth.uid()`, `companies`, `profiles`, `user_roles` e os helpers
`is_super_admin`, `is_company_member`, `is_company_manager`, `company_module_enabled`,
`touch_updated_at`). Os stubs só imitam o comportamento usado pelas migrações de Lojas.

```bash
createdb omni_test
psql -d omni_test -v ON_ERROR_STOP=1 -f tests/sql/supabase-stubs.sql
psql -d omni_test -v ON_ERROR_STOP=1 -f drizzle/migrations/0007_retail_core_stage1.sql
psql -d omni_test -v ON_ERROR_STOP=1 -f drizzle/migrations/0008_retail_pos_cash_stage2.sql
psql -d omni_test -q -f tests/sql/retail-pos-stage2.sql   # imprime PASS/FAIL por cenário e TOTAL
dropdb omni_test
```

O teste usa `SET ROLE authenticated` e `set_config('test.uid', ...)` para simular cada utilizador,
por isso as políticas RLS e as RPCs `SECURITY DEFINER` são exercitadas como em produção.
Os mesmos cenários existem em `tests/retail-pos-integration.test.ts` para o banco real.
