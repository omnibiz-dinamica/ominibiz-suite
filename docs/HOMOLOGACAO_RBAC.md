# OmniBiz — Homologação Arquitetural RBAC

> **Status:** Oficial · **Versão:** 1.0 · **Referência normativa:** [`docs/ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md)
>
> Este documento define o **processo obrigatório de auditoria arquitetural** que todo módulo do OmniBiz deve passar antes de ser considerado homologado. Ele é a extensão executável da arquitetura RBAC v1.0 e deve ser reexecutado a cada nova versão de qualquer módulo.

---

## 1. Objetivo

Antes de considerar qualquer módulo homologado, verificar **automaticamente e de forma reproduzível** se ele respeita a arquitetura RBAC oficial:

1. Permissões coerentes com a matriz da secção 2 do `ARCHITECTURE_RBAC.md`.
2. `RoleGuard` correto em todas as rotas do módulo.
3. RLS coerente com a matriz para **Owner, Gestor, Funcionário, Super Admin**.
4. Fluxo operacional com papéis explícitos (**quem executa, quem aprova, quem audita**).
5. Notificações via helpers padronizados (sem destinatários hardcoded).
6. Emails na categoria correta (Operacional → Gestor/Funcionário · SaaS → Super Admin).
7. Dashboard prioriza o Gestor para informações operacionais.
8. Exportações respeitam as permissões da matriz.
9. Ações críticas possuem trilha de auditoria.

---

## 2. Legenda de conformidade

| Símbolo | Significado | Ação |
|---|---|---|
| ✅ | **Conforme arquitetura** — item validado, sem ressalvas. | Nenhuma. |
| 🟡 | **Divergência parcial** — funciona, mas viola detalhe da arquitetura. | Registar em backlog técnico, corrigir antes da próxima MINOR. |
| 🔴 | **Não conforme** — bloqueador de homologação. | Corrigir **antes** do módulo ser marcado como homologado. |
| ⚪ | **Não aplicável** — item não faz sentido para este módulo. | Justificar em observação. |

---

## 3. Checklist padrão (executar por módulo)

Copiar o bloco abaixo para cada módulo auditado. Preencher os símbolos e a coluna "Evidência" com caminho de arquivo / função / migration relevante.

### 3.1 Permissões e Guardas

| # | Item | Status | Evidência |
|---|---|---|---|
| P1 | Rotas do módulo protegidas por `<RoleGuard allow={[...]}/>` coerente com a matriz | | |
| P2 | `effectiveRole` respeitado (Owner herda Gestor; Super Admin com empresa herda Gestor) | | |
| P3 | Nenhuma UI exclusiva de Super Admin exposta a Gestor/Funcionário | | |
| P4 | Nenhuma UI operacional escondida do Gestor por engano | | |

### 3.2 RLS por perfil

| # | Item | Status | Evidência |
|---|---|---|---|
| R1 | **Owner** — políticas coerentes com escopo `company_id` (herdando Gestor) | | |
| R2 | **Gestor** — políticas por `company_id` via `has_role` / claim de empresa ativa | | |
| R3 | **Funcionário** — políticas por `auth.uid()` (somente próprios dados) | | |
| R4 | **Super Admin** — políticas via `has_role(auth.uid(), 'super_admin')` (não hardcoded email/id) | | |
| R5 | Todas as tabelas `public.*` do módulo têm `ENABLE ROW LEVEL SECURITY` | | |
| R6 | Todas as tabelas têm `GRANT` explícito para os roles usados nas policies | | |

### 3.3 Fluxo operacional

| # | Item | Status | Evidência |
|---|---|---|---|
| F1 | **Quem executa** está declarado (Gestor / Funcionário / externo) | | |
| F2 | **Quem aprova** está declarado e implementado (ou N/A justificado) | | |
| F3 | **Quem audita** tem acesso ao histórico (Super Admin global, Gestor da empresa) | | |
| F4 | Fluxo espelha a matriz da secção 2 do `ARCHITECTURE_RBAC.md` | | |

### 3.4 Notificações

| # | Item | Status | Evidência |
|---|---|---|---|
| N1 | Usa `notifyManagers` / `notifyOwner` / `notifyEmployees` / `notifyApprovers` | | |
| N2 | Nenhum destinatário hardcoded (`user_id` fixo, email literal, lista estática) | | |
| N3 | Super Admin **não** é destinatário primário de evento operacional | | |
| N4 | Payload inclui `company_id`, `entity_type`, `entity_id`, `action`, `actor_id` | | |

### 3.5 Emails

| # | Item | Status | Evidência |
|---|---|---|---|
| E1 | Envio via `sendTransactionalEmail()` — sem `fetch` direto | | |
| E2 | Template registado em `src/lib/email-templates/registry.ts` | | |
| E3 | Emails **operacionais** vão para Gestor / Owner / Funcionário — nunca Super Admin | | |
| E4 | Emails **SaaS** vão apenas para Super Admin | | |
| E5 | Branding resolvido a partir de `company_id` (não hardcoded) | | |

### 3.6 Dashboard

| # | Item | Status | Evidência |
|---|---|---|---|
| D1 | Widgets operacionais do módulo aparecem no dashboard do **Gestor** | | |
| D2 | Super Admin com empresa selecionada vê o mesmo dashboard do Gestor (herança) | | |
| D3 | Super Admin sem empresa vê apenas KPIs SaaS — sem dados operacionais duplicados | | |
| D4 | Funcionário vê apenas visão pessoal (próprias tarefas / ponto / férias / recibos) | | |

### 3.7 Exportações

| # | Item | Status | Evidência |
|---|---|---|---|
| X1 | Botão de exportação respeita `RoleGuard` do módulo | | |
| X2 | Escopo da exportação = escopo da leitura RLS (não vaza dados de outras empresas) | | |
| X3 | Funcionário só exporta próprios dados (quando aplicável) | | |

### 3.8 Auditoria

| # | Item | Status | Evidência |
|---|---|---|---|
| A1 | Ações críticas (aprovar/rejeitar, editar registo de ponto, publicar recibo, assinar contrato) gravam histórico | | |
| A2 | Histórico inclui `actor_id`, `timestamp`, valor anterior e novo (quando aplicável) | | |
| A3 | Histórico é consultável por Gestor da empresa e Super Admin | | |
| A4 | Histórico **nunca** é editável via UI | | |

---

## 4. Resultado consolidado por módulo

Para cada módulo, atribuir **um único selo final** baseado no pior status encontrado:

- ✅ se **todos** os itens aplicáveis forem ✅ (ou ⚪ justificado).
- 🟡 se houver 🟡 mas **nenhum** 🔴.
- 🔴 se houver **qualquer** 🔴.

Módulo com selo 🔴 **não pode** ser marcado como homologado no changelog da versão.

### 4.1 Tabela de acompanhamento

> Preencher a cada ciclo de homologação. Mantém histórico das últimas 3 versões.

| Módulo | v1.0 | v1.1 | v1.2 | Última auditoria | Responsável |
|---|---|---|---|---|---|
| Dashboard | ⏳ | — | — | — | — |
| RH · Recibos | ⏳ | — | — | — | — |
| Equipa | ⏳ | — | — | — | — |
| Férias | ⏳ | — | — | — | — |
| Folha de Ponto | ⏳ | — | — | — | — |
| Despesas | ⏳ | — | — | — | — |
| Frota | ⏳ | — | — | — | — |
| Comercial | ⏳ | — | — | — | — |
| Clientes | ⏳ | — | — | — | — |
| Contratos | ⏳ | — | — | — | — |
| Empresa | ⏳ | — | — | — | — |
| Administração SaaS | ⏳ | — | — | — | — |
| Assistente IA | ⏳ | — | — | — | — |

Legenda da coluna de versão: ✅ / 🟡 / 🔴 / ⏳ (auditoria pendente).

---

## 5. Processo operacional

### 5.1 Quando executar

- **Obrigatório** antes de fechar cada release MINOR ou MAJOR.
- **Obrigatório** antes de considerar um módulo novo "homologado" pela primeira vez.
- **Recomendado** após qualquer PR que toque em `RoleGuard`, RLS, notificações, emails ou dashboards.

### 5.2 Como executar

1. Abrir uma cópia deste documento por ciclo de homologação em `docs/homologacoes/YYYY-MM-DD-vX.Y.md`.
2. Para cada módulo da secção 4.1, preencher o checklist da secção 3.
3. Anexar evidências (caminho de arquivo, nº de linha, id de migration, prints de UI quando pertinente).
4. Consolidar o selo final na tabela 4.1.
5. Publicar o resultado no PR de release.

### 5.3 Bloqueadores de release

Um módulo **não** pode ir para produção com selo 🔴. Módulos com 🟡 podem ir para produção **desde que** o item divergente esteja registado em backlog técnico com prazo de correção na próxima MINOR.

### 5.4 Governança

- Alterações ao processo (adicionar/remover itens do checklist) requerem atualização da versão deste documento e menção no `ARCHITECTURE_RBAC.md`.
- Divergência entre este checklist e o `ARCHITECTURE_RBAC.md` é **bug de documentação**: o `ARCHITECTURE_RBAC.md` é a fonte primária; este documento deriva dele.

---

## 6. Anexo — Fontes de evidência sugeridas

| Categoria | Onde procurar |
|---|---|
| RoleGuard | `src/components/RoleGuard.tsx` e uso em `src/routes/app.*.tsx` |
| effectiveRole | `src/lib/auth.tsx` |
| RLS | `supabase/migrations/*.sql` (procurar `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `GRANT`) |
| has_role | função SQL `public.has_role(_user_id, _role)` |
| Notificações | helpers `notifyManagers` / `notifyOwner` / `notifyEmployees` / `notifyApprovers` |
| Emails | `src/lib/email/send.ts` (`sendTransactionalEmail`) e `src/lib/email-templates/registry.ts` |
| Dashboard | `src/components/dashboards/*.tsx` |
| Auditoria | tabelas `*_audit`, `*_history`, `punch_admin_log`, etc. |

---

**Fim do documento — versão 1.0**