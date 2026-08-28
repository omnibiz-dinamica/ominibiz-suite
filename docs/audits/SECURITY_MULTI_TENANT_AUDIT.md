# OmniBiz - Auditoria de Seguranca Multi-Tenant

**Data:** 2026-08-28  
**Modo:** somente leitura  
**P0:** 0 confirmado | **P1:** 3 | **P2:** 4 | **P3:** 2

## Identidade e isolamento

A identidade permanente e `auth.users.id`, referenciada por `profiles.id` e usada como `auth.uid()`. Email aparece no aceite de convite e no bootstrap especial do Super Admin, mas nao substitui o UUID como chave relacional. O isolamento de empresa usa `company_id`, membership em `user_roles` e o contexto `profiles.current_company_id`.

As migrations habilitam RLS nas tabelas versionadas e usam helpers `is_company_member`, `is_company_manager`, `is_company_owner` e `is_super_admin`. O isolamento principal de SELECT/INSERT/UPDATE/DELETE existe para Core, Ponto, RH, Despesas e Suporte, com RPCs `SECURITY DEFINER` para operacoes sensiveis.

## Achados

### 🟠 P1 - Relacoes cross-tenant nao sao reforcadas por FK composto

`tasks`, `time_entries`, `clients`, `client_assignees` e registros relacionados carregam `company_id`, mas as FKs observadas validam apenas o UUID do registro relacionado. Nao foi encontrada constraint composta que exija, por exemplo, `tasks.company_id = clients.company_id` ou `time_entries.company_id = tasks.company_id`.

**Impacto:** uma escrita autorizada pode criar relacao entre uma linha da Empresa A e uma linha da Empresa B se o call-site/RPC nao validar o par. Isso nao significa vazamento SELECT confirmado, mas permite mistura de dados e aumenta o risco de IDOR/integridade.

**Recomendacao:** validar empresa em todas as RPCs de escrita e, por dominio, adicionar FKs compostas ou triggers de imutabilidade quando a tabela tiver chave unica `(id, company_id)`. Nao implementar nesta auditoria.

### 🟠 P1 - Comercial SaaS nao tem chave de empresa

`commercial_clients`, `contracts`, `contract_services`, `contract_workflow`, `invoices` e `ai_usage` nao possuem `company_id` nas definicoes observadas. As policies sao `super_admin_all`. O live REST confirmou `commercial_clients` e `invoices` existentes, ambos sem dados no momento da consulta.

**Impacto:** o dominio Comercial funciona como backoffice global, nao como CRM multiempresa. Se o acesso for ampliado a Owners/Gestores sem remodelagem, nao ha isolamento relacional suficiente.

**Recomendacao:** decidir formalmente se esse dominio e plataforma global ou tenant-owned. Se for tenant-owned, adicionar `company_id`, backfill auditado, FKs, indices, RLS e RPCs. Se continuar global, manter rota exclusiva e nomear explicitamente como SaaS Backoffice.

### 🟠 P1 - `company_hr_settings` tem falha funcional de privilegio direto

A migration cria policy SELECT para membros e concede a view `company_hr_punch_settings`, mas o probe live autenticado recebeu `42501` ao consultar diretamente `public.company_hr_settings`. Isso confirma que a tabela nao esta disponivel para SELECT direto no papel autenticado.

**Impacto:** qualquer tela que leia a tabela base diretamente pode falhar, como ja ocorreu no historico do projeto. A view/RPC pode ser o caminho correto, mas o contrato nao esta uniforme.

**Recomendacao:** escolher um unico contrato: leitura por view/RPC ou grant/policy direto. Auditar todos os call-sites para que nao dependam de acesso proibido. Nao alterar agora.

### 🟡 P2 - Rotas de Restaurante sem ModuleGuard

As 8 rotas `app.restaurante.*` possuem `RoleGuard`, mas nao `ModuleGuard`. `AppLayout` filtra o menu por `enabled_modules`, porem isso nao e protecao de URL direta. Hoje o impacto e reduzido porque as paginas sao `ComingSoon`; quando receberem dados, o risco sobe para P1.

### 🟡 P2 - `.env` esta versionado

`git ls-files .env` retorna verdadeiro. A auditoria decodificou a chave e confirmou role `anon`/publishable; nao foi encontrada service role nas variaveis `VITE_*`. Ainda assim, versionar configuracao de ambiente aumenta o risco de vazamento futuro e mistura configuracao de deploy com codigo.

### 🟡 P2 - Helpers de teste concedidos a `PUBLIC`

As migrations concedem `EXECUTE` a `PUBLIC` para `_run_calc_tests()`. Nao foi confirmada exposicao de dados sensiveis, mas funcoes de teste nao devem permanecer publicamente executaveis em producao sem justificativa.

### 🟡 P2 - Regra de Super Admin por email hardcoded

`get_auth_context()` garante `super_admin` para `edurts.pt@gmail.com`. O role em `user_roles` continua sendo a fonte relacional, mas o email hardcoded cria dependência operacional e deve ser substituido por bootstrap controlado/migration administrativa.

### 🔵 P3 - Catalogo de destinos de suporte com SELECT amplo

A migration de `support_destinations` usa `USING (true)` para SELECT de um catalogo autenticado. Isso parece intencional para dados de destino, mas deve permanecer sem dados sensiveis e ser documentado como catalogo publico a utilizadores autenticados.

### 🔵 P3 - Auditoria de leitura de anexos

`KNOWN_ISSUES.md` registra que abrir/baixar anexo nao gera evento dedicado `attachment_read`; metadata de upload e auditada. Impacto baixo, mas relevante para trilha completa.

## Teste conceitual de isolamento

| Tentativa | Evidencia atual | Resultado esperado |
|---|---|---|
| Empresa A SELECT dados de B | policies por `company_id`/membership; nao executado com conta employee de A | NEGADO |
| Empresa A INSERT `company_id` de B | policies usam helper de empresa; FKs compostas nao cobrem todos os pares | NEGADO; precisa teste E2E por tabela |
| Empresa A UPDATE B | policies e RPCs validam empresa | NEGADO |
| Empresa A chama RPC com company B | RPCs sensiveis consultam o registro e checam papel/empresa; revisar cada RPC | NEGADO |
| URL direta de Restaurante sem modulo | sem ModuleGuard nas rotas | atualmente mostra placeholder; deveria NEGADO |

Este teste conceitual nao substitui uma matriz automatizada com dois utilizadores reais, porque a sessao disponivel era Super Admin e, por definicao, tem acesso global.

## Conclusao de seguranca

O Core tem uma base RLS/RBAC significativa e varias correcoes historicas documentadas, mas a garantia completa de isolamento ainda e 🟡 INCOMPLETA por causa das relacoes sem FK composto, do Comercial sem tenant key e do contrato inconsistente de `company_hr_settings`. Nao ha P0 confirmado nesta leitura.

