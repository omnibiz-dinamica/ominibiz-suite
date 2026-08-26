# OmniBiz — Known Issues

## KI-025 — Suporte N1/N2: ações via `window.prompt` (2026-07-23)

**Sintoma.** Ações de escalonamento, resolução interna, solicitação de
informação e devolução usam `window.prompt` para captar motivo/resumo.
Funcional e auditável, mas estilo inconsistente com o restante do app.

**Impacto.** Baixo — UX. Não afeta segurança nem auditoria (RPCs
registram todos os campos em `support_ticket_events`).

**Mitigação planejada.** Substituir por diálogos dedicados
(`EscalateTicketDialog`, `ResolveByManagerDialog`, `ReturnToManagerDialog`)
em iteração de UI subsequente.

## KI-028 — [RESOLVIDO] RLS cross-tenant em anexos/mensagens de suporte

- **Severidade:** 🔴 Crítica · **Status:** ✅ Resolvido (2026-07-16) · **Módulo:** Suporte · Segurança
- **Sintoma:** As policies `INSERT` de `support_ticket_attachments` e
  `support_ticket_messages` avaliavam `t.company_id = t.company_id`
  (comparação autorreferencial, sempre `TRUE`). Um Gestor autenticado
  poderia — via chamada direta ao Data API — inserir anexo/mensagem
  referenciando um `ticket_id` pertencente a outra empresa, desde que
  informasse no payload seu próprio `company_id`.
- **Impacto:** Potencial escrita cross-tenant em duas tabelas do
  módulo de Suporte. Sem evidência de exploração; RPCs `SECURITY
  DEFINER` do módulo (`register_support_attachment`,
  `post_support_ticket_message`) já validavam o vínculo, mas a policy
  em si estava permissiva.
- **Correção:** Substituída a condição por
  `t.company_id = support_ticket_<tabela>.company_id`. Migração
  aplicada em 2026-07-16.

## KI-027 — `support_tickets.company_id` mutável em UPDATE

- **Severidade:** 🟡 Média · **Status:** Aberto · **Módulo:** Suporte · Segurança
- **Sintoma:** A policy `managers update own company support_tickets`
  usa `USING = WITH CHECK = is_company_manager(auth.uid(), company_id)`.
  Isso protege contra ataques triviais, mas não impede que um Gestor
  que administre duas empresas mova um ticket entre elas via UPDATE
  do `company_id`.
- **Impacto:** Baixo em prática (cenário exige duplo vínculo de
  gestor); nenhuma escrita externa ao usuário legítimo. As RPCs do
  módulo não expõem esse campo para edição.
- **Correção planejada:** Adicionar predicado
  `OLD.company_id = NEW.company_id` via trigger ou coluna gerada; ou
  travar `company_id` como imutável através de trigger `BEFORE UPDATE`.
  Fora do escopo do P0 atual — registrado para próxima janela.

## KI-026 — Central de Suporte: respostas rápidas hardcoded e auditoria de leitura de anexo

- **Severidade:** 🔵 Baixa · **Status:** Aberto · **Módulo:** Suporte
- **Descrição:** Fase 1.1 introduz 7 templates de resposta rápida
  hardcoded em `src/lib/support/constants.ts`. Super Admin ainda não
  pode editar/criar templates via UI. Além disso, o download/preview
  de anexo não gera evento em `support_ticket_events`.
- **Impacto:** Baixo — templates cobrem os cenários mais comuns e o
  Storage já mantém logs próprios; a auditoria de metadata de anexo
  já é feita no `attachment_added`.
- **Plano:** Fase 2 — tabela `support_reply_templates` (RLS por Super
  Admin) e evento `attachment_read`.

## KI-025 — Homologação Sara V1.0: exportações Excel/PDF sem validação de conteúdo

- **Severidade:** 🔵 Baixa · **Status:** Aberto · **Módulo:** Exportações
- **Descrição:** Botões de exportação (Excel e PDF) foram acionados sem erro visual durante a homologação Sara V1.0, mas o conteúdo dos arquivos não foi inspecionado.
- **Impacto:** Baixo — nenhum indício de corrupção. Requerida bateria Playwright que abra os binários, valide extensão, cabeçalhos, filtros aplicados e paginação/layout no caso do PDF.
- **Workaround:** validação manual pontual.
- **Plano:** próxima janela de QA, sem bloqueio de release.

> **Status:** Oficial · **Versão:** 1.0 · **Última revisão:** 2026-07-06
> **Escopo:** Registro vivo de problemas conhecidos, seu impacto, workaround e plano de resolução.
> **Regra:** todo bug reproduzível em produção deve ser lançado aqui antes de ir para o backlog.

---

## Legenda

| Campo | Valores |
|---|---|
| Severidade | 🔴 Crítica · 🟠 Alta · 🟡 Média · 🔵 Baixa |
| Status | Aberto · Em análise · Em correção · Resolvido |
| Módulo | Ponto · Clientes · Tarefas · Comercial · Frota · RH · Dashboard · Auth · Mapas · Notificações |

---

## KI-021 — `EmployeePicker` ainda não presente em RH (recibos) e Comercial

- **Severidade:** 🔵 Baixa
- **Status:** Aberto
- **Módulo:** RH · Comercial
- **Contexto:** Bloco 2 (Fases F/G) padronizou o `<EmployeePicker />` como
  filtro de listagem em Tarefas, Despesas, Férias e Ponto/Gestão. RH
  (recibos) e Comercial não expõem filtro de colaborador nas listagens
  atuais — nada regrediu, mas a paridade de UX ainda não existe.
- **Workaround:** filtro por texto/estado atual continua funcional.
- **Plano:** adotar o picker quando esses módulos passarem por refino de
  listagem no próximo ciclo.

---

## KI-022 — Reset de senhas de homologação não executável do sandbox

- **Severidade:** 🔵 Baixa
- **Status:** ✅ Resolvido para `manager@homologacao.test` e
  `employee@homologacao.test` em 2026-07-16 (reset direto via SQL
  `UPDATE auth.users SET encrypted_password = crypt('Homolog@2026',
  gen_salt('bf'))` com trava por `email` + `id`, UUIDs preservados,
  histórico operacional intacto, login E2E validado). Super Admin
  (`edurts.pt@gmail.com`) permanece fora de escopo por ser conta real
  do dono do produto — não deve ser resetado.
- **Módulo:** Auth · Homologação
- **Contexto:** A Fase H prevê reset em massa (`Homolog@2026`) das contas de
  homologação via `supabase.auth.admin.updateUserById`. Executar isso a partir
  do sandbox de build exige (a) service role acessível ao processo, (b)
  `src/start.ts` com `functionMiddleware` de bearer registrado e (c)
  `createServerFn` protegido por `requireSupabaseAuth` invocável do painel
  Super Admin. O projeto ainda não expõe `src/start.ts` nem tem o painel de
  reset.
- **Workaround:** procedimento manual pelo Super Admin — usar a Auth Admin
  API do Supabase (script server-side com service role) ou disparar o fluxo
  padrão de recuperação de senha (`supabase.auth.resetPasswordForEmail`) para
  cada e-mail de homologação. Preservar sempre o fluxo oficial dos e-mails
  listados em `docs/HOMOLOGACAO_RBAC.md`.
- **Plano:** implementar item 4 do "Roadmap Técnico Futuro" em `DECISIONS.md`
  (painel Super Admin de reset) — resolve esta KI.

---

## KI-023 — `public.user_roles` sem UNIQUE(user_id, role)

- **Severidade:** 🟡 Média
- **Status:** Aberto
- **Módulo:** Auth · RBAC
- **Detectado em:** 2026-07-16

**Sintoma:** Super Admin (`82ae91cb-315c-4641-8eaa-9b75b6f153f5`) possui
615 linhas em `public.user_roles` com `role='super_admin'`. O
`ARCHITECTURE_RBAC.md` prevê `UNIQUE(user_id, role)` na criação da tabela.

**Causa provável:** constraint ausente ou removida em migração histórica;
algum path de código chama insert em vez de upsert para o par
(`user_id`,`role`).

**Impacto:** aumento marginal de custo em `has_role()` (STABLE, cacheável)
e em joins com `user_roles`. Sem risco funcional imediato — a função
`has_role` usa `EXISTS`, então duplicidade não altera resposta booleana.

**Workaround:** nenhum necessário no momento.

**Correção planejada:**
1. Migration `DELETE ... WHERE ctid NOT IN (SELECT min(ctid) ...)` para
   deduplicar; 2. `ALTER TABLE public.user_roles ADD CONSTRAINT
   user_roles_user_role_uniq UNIQUE(user_id, role);` 3. Auditar
   call-sites que inserem em `user_roles` para usar `ON CONFLICT
   (user_id, role) DO NOTHING`.

---

## KI-024 — Super Admin com `profiles.is_active = false`

- **Severidade:** 🔵 Baixa
- **Status:** Aberto
- **Módulo:** Auth · Profiles
- **Detectado em:** 2026-07-16

**Sintoma:** O profile do Super Admin real
(`82ae91cb-315c-4641-8eaa-9b75b6f153f5`) está com `is_active=false`,
apesar de a autenticação e navegação funcionarem normalmente
(`last_sign_in_at = 2026-07-15`).

**Causa provável:** estado herdado de rotina antiga de desativação/
/reativação. O gate de login não consulta `profiles.is_active`; guards
de rota usam `user_roles` + `effectiveRole`.

**Impacto:** nenhum funcional confirmado. Risco de futuras políticas
RLS que passem a filtrar por `profiles.is_active` bloquearem o Super
Admin inadvertidamente.

**Correção planejada:** validar semanticamente o significado de
`profiles.is_active` (documentar em `ARCHITECTURE_PRINCIPLES.md`) e
então normalizar via UPDATE pontual — não incluída nesta tarefa por
estar fora do escopo do pedido de restauração de credenciais.

---

## KI-001 — Geocoding retorna `REQUEST_DENIED`

- **Severidade:** 🟠 Alta
- **Módulo:** Mapas / Clientes
- **Status:** ✅ Resolvido em Fase 3 (2026-07-06)
- **Detectado em:** 2026-07-05
- **Origem:** relatório do sprint de refinamento (item 16)

**Sintoma:** Ao editar cliente e buscar endereço, console mostra `geocode: REQUEST_DENIED`. Endereço não é resolvido.

**Causa raiz confirmada:** `src/lib/maps/providers/google.ts:178` chama `google.maps.Geocoder()` (SDK JS, browser key). A browser key da Lovable é restrita por referrer e autoriza apenas **Maps JavaScript API** e **Places API (New)**. Chamadas ao **Geocoding API** são rejeitadas por design.

**Solução aplicada (Fase 3):** geocoding e reverse geocoding migrados para server functions em `src/lib/maps/geocoding.functions.ts` (`geocodeAddressFn`, `reverseGeocodeFn`). Chamam o Lovable Connector Gateway (`connector-gateway.lovable.dev/google_maps/maps/api/geocode/json`) com `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_MAPS_API_KEY}`. Nenhum segredo é exposto ao navegador. O provider `google.ts` foi atualizado para usar as server functions, mantendo o contrato `MapProvider.geocode()` / `MapProvider.reverseGeocode()` — 100% retrocompatível.

---

## KI-002 — Cache de nome de cliente desatualizado em telas secundárias

- **Severidade:** 🟠 Alta
- **Módulo:** Clientes
- **Status:** ✅ Resolvido em Fase 3 (2026-07-06)
- **Detectado em:** 2026-07-05

**Sintoma:** Após renomear cliente, algumas telas (tarefas, ponto, gestão, comercial) continuam mostrando o nome antigo até refresh.

**Causa raiz confirmada:** existem 6 `queryKey` distintos apontando para clientes:

| queryKey | Arquivo |
|---|---|
| `["clients", ...]` | `app.clientes.tsx` |
| `["client-assignees", ...]` | `app.clientes.tsx` |
| `["clients-min", companyId]` | `app.tarefas.tsx` |
| `["clients-map", companyId]` | `app.ponto.tsx` |
| `["punch-admin-clients-filter", companyId]` | `app.ponto_.gestao.tsx` |
| `["commercial_clients"]` | `app.comercial.clientes.tsx` |
| `["wizard-clients"]` | `app.comercial.contratos.novo.tsx` |

A mutation de edição só invalida `["clients"]`; os demais permanecem em cache até o TTL padrão do React Query.

**Solução aplicada (Fase 3):** criado o helper `invalidateClientsCache(qc)` em `src/lib/cache/clients.ts` que invalida em bloco todos os prefixos que dependem de `public.clients` (`clients`, `client-assignees`, `clients-min`, `clients-map`, `wizard-clients`, `punch-admin-clients-filter`). Todas as mutations e realtime subscribers de `app.clientes.tsx` foram migrados para o helper. `commercial_clients` fica fora de escopo por ser tabela independente do módulo Comercial.

---

## KI-003 — Extensão Kaspersky causa hydration mismatch na tela de login

- **Severidade:** 🔵 Baixa
- **Módulo:** Auth
- **Status:** Não corrigível pelo produto

**Sintoma:** `Hydration failed` em `/login` com nó `<kpm-field-badge>` injetado.

**Causa:** extensão Kaspersky Password Manager modifica DOM antes do React hidratar. É comportamento da extensão, não da aplicação.

**Workaround:** desabilitar extensão em ambiente de desenvolvimento.

---

## KI-004 — Precisão GPS variável indoor

- **Severidade:** 🟡 Média
- **Módulo:** Ponto (Geolocalização)
- **Status:** Em análise (Fase 1)

**Sintoma:** Em prédios/estacionamentos cobertos, `accuracy > 80m` classifica como "Muito baixa" e bloqueia operações mesmo com o funcionário no local correto.

**Análise completa:** `docs/RELATORIO_GEOLOCALIZACAO.md`.

**Correção planejada (Fase 6):** `watchPosition` com refinamento progressivo + fallback manual justificado.

---

## KI-005 — Cards do Dashboard não navegáveis (Resolvido)

- **Severidade:** 🔵 Baixa
- **Módulo:** Dashboard
- **Status:** Resolvido em Fase 2 (2026-07-06)

**Sintoma:** Os cartões "Pendentes / Em andamento / Concluídas / Atrasadas" do Dashboard exibiam contagens mas não permitiam navegar para a lista de tarefas.

**Correção:** Cartões convertidos em `<Link>` do TanStack Router apontando para `/app/tarefas`, com estados de hover, foco visível e `aria-label` descritivo. A lista "Próximas tarefas" recebeu link "Ver todas" e cada item também navega para tarefas.

**Arquivo:** `src/routes/app.index.tsx`.

---

## KI-006 — Tradução automática do navegador quebra a hidratação (Resolvido)

- **Severidade:** 🟠 Alta
- **Módulo:** Global (SSR / Root)
- **Status:** Resolvido em Fase 2 (2026-07-06)

**Sintoma:** Com Chrome/Edge configurado para traduzir automaticamente páginas em português, o React reportava `Hydration failed` porque o DOM traduzido não coincidia com o HTML renderizado no servidor. Extensões de senha (ex.: Kaspersky `kpm-field-badge`) agravavam o efeito.

**Correção:** Em `src/routes/__root.tsx`:
- `<html lang="pt-BR" translate="no" className="notranslate">`
- `<meta name="google" content="notranslate" />`

Isso instrui o navegador a não traduzir a UI, preservando textos operacionais (status, valores monetários, nomes de clientes) e evitando divergência entre SSR e cliente.

**Riscos:** nenhum. Usuários que precisem traduzir ainda podem selecionar trechos e traduzir manualmente.

**Arquivo:** `src/routes/__root.tsx`.

---

## KI-007 — Risco de subscribers Realtime duplicados (Resolvido preventivamente)

- **Severidade:** 🟡 Média
- **Módulo:** Global (Realtime)
- **Status:** Resolvido em Fase 4 (2026-07-06)

**Sintoma potencial:** múltiplos módulos criando `supabase.channel(...).subscribe()` inline correm risco de: (a) esquecer `removeChannel` no cleanup e vazar subscribers em loop, agravando o custo de Realtime; (b) colidir nome de canal entre módulos; (c) invalidar prefixos avulsos, bypassando os helpers de cache.

**Correção preventiva:** criado `src/lib/realtime/subscribe.ts` (`useRealtimeSubscription`, `useRealtimeInvalidate`). Nenhum código novo pode chamar `supabase.channel(...)` diretamente para `postgres_changes`. Ver ADR-011.

**Aplicado em Fase 4:** `src/routes/app.notificacoes.tsx` migrado para a nova infraestrutura. Demais módulos permanecem inalterados até refactor natural.

---

## KI-008 — Convite manual no fluxo Super Admin (Resolvido)

- **Severidade:** 🟠 Alta (UX + auditoria)
- **Módulo:** Onboarding · `/app/admin`
- **Status:** Resolvido em Fase 5 (2026-07-07)

**Sintoma:** ao criar uma empresa, o Super Admin recebia apenas o link do convite, sem envio automático. O gestor dependia de canal externo (Slack/WhatsApp) e o envio não ficava em `email_send_log`.

**Causa raiz:** `admin_create_company_with_invite` não retornava `invite_id` e a UI não disparava o email transacional após a criação.

**Correção:** RPC ajustada (retorna `invite_id`, `invite_email`); `app.admin.tsx` dispara automaticamente `sendInviteEmail` (ADR-014). Novo `ManagerInviteCard` em `/app/empresa` cobre reenvio e troca de email (nova RPC `admin_replace_manager_invite`).

---

## Template para novos registros

```
## KI-XXX — Título curto
- Severidade: 🔴/🟠/🟡/🔵
- Módulo:
- Status:
- Detectado em: YYYY-MM-DD

**Sintoma:** ...
**Causa raiz:** ...
**Impacto:** ...
**Workaround:** ...
**Correção planejada:** ...
```
- KI-025 (parcial): `window.prompt` eliminado no fluxo de reabertura de tickets; outros fluxos de suporte ainda podem usá-lo.

## KI-026 — Menus autorizados desapareciam por causa do ramo (Resolvido)
- **Severidade:** 🔴 Crítica (navegação)
- **Módulo:** Navegação · `AppLayout`
- **Status:** Resolvido em 2026-08-19 (ADR-030)

**Sintoma:** Clientes e Tarefas (entre outros) desapareciam do menu do Gestor em
determinadas sessões, embora `/app/clientes` e `/app/tarefas` funcionassem por
URL direta.

**Causa raiz:** o menu do ramo Restaurante & Delivery substituía a árvore geral
em vez de a complementar; qualquer empresa marcada como `restaurant_delivery`
perdia os itens gerais. Agravante: durante o carregamento do contexto o menu era
calculado com dados incompletos.

**Correção:** fonte canónica `resolveAvailableNavigation`, ramo aditivo,
skeleton enquanto o contexto carrega e saneamento do estado de grupos
colapsados.


## KI-027 — Dedup de notificações em lote falhou com `NOT EXISTS` (Resolvido)
- **Severidade:** 🟠 Alta (notificações)
- **Módulo:** Tarefas · `tasks_notify_insert`
- **Status:** Resolvido em 2026-08-23 (Fase B)

**Sintoma:** ao criar uma tarefa para vários responsáveis, os gestores não
recebiam qualquer notificação.

**Causa raiz:** a dedup por lote testava a inexistência de irmãos com o mesmo
`task_group_id`. Em `INSERT` multi-linha, os triggers `AFTER ... FOR EACH ROW`
correm com **todas** as linhas já visíveis, logo a condição era falsa em todas
as linhas.

**Correção:** vencedor determinístico — só a linha com o menor `id` do grupo
notifica gestores. Confirmado por teste em base real (dados de teste removidos).

## KI-028 — Rotas `/app/restaurante/*` sem ModuleGuard (gap conhecido)

**Severidade.** Média · **Estado.** Aberto (intencional, ADR-033)

As rotas de Restaurante só têm `RoleGuard` e não constam de `ROUTE_MODULES`, pelo que
o acesso por URL direta não é bloqueado quando os módulos `restaurant_*` estão
desativados (as páginas são placeholders "Em breve"). Grupo V-clean e Dinâmica Solução
estão marcadas como `restaurant_delivery` sem nenhum módulo `restaurant_*` ativo
(anomalia pré-existente). Aplicar o `ModuleGuard` mudaria o comportamento dessas
empresas (ComingSoon → 403); fica para auditoria dedicada, fora da Fase A do vertical
Material de Construção.

## KI-029 — 8 ocorrências históricas duplicadas fora do âmbito da limpeza P0

**Severidade.** Baixa · **Estado.** Aberto (intencional, ADR-041)

Após a limpeza, restam 8 ocorrências com mais de uma tarefa activa (Julho/Agosto:
COIFA, Escritório, Escritório Life Tidy (PT), Escritório Sara). Todas em estado
terminal (`concluido`, `cancelado`, `ausente`) e com histórico operacional, pelo
que ficaram deliberadamente fora do critério `EXCLUIR_SEGURO`. Não existe qualquer
duplicata `pendente` remanescente. Requer análise caso a caso com o Gestor antes
de qualquer acção.
