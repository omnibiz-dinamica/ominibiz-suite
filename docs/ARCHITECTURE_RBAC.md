# OmniBiz — Arquitetura Oficial de Perfis (RBAC)

> **Status:** Oficial · **Versão:** 1.0 · **Escopo:** Referência obrigatória para toda nova funcionalidade do OmniBiz.
>
> Este documento é a **fonte única de verdade** para decisões sobre perfis, permissões, notificações e emails. Qualquer módulo novo — ou refatoração de módulo existente — deve ser validado contra este documento **antes** de entrar em desenvolvimento.

---

## 1. Hierarquia oficial

```
Super Admin        ← administrador global da plataforma SaaS
     ↓
  Owner            ← proprietário/responsável legal de UMA empresa
     ↓
  Gestor           ← utilizador principal do fluxo operacional diário
     ↓
Funcionário       ← colaborador da empresa
```

### 1.1 Responsabilidades por perfil

| Perfil | Escopo | Responsabilidades principais | O que NÃO faz |
|---|---|---|---|
| **Super Admin** | Plataforma inteira (multi-tenant) | Gestão de tenants, planos, billing, saúde da plataforma, suporte técnico global, auditoria cross-company. Ao selecionar uma empresa (`currentCompanyId != null`) **herda a visão do Gestor** dessa empresa e recebe as notificações operacionais in-app correspondentes. | Não recebe emails operacionais; emails continuam separados entre operação e SaaS. |
| **Owner** | Uma empresa | Titularidade legal, decisões estratégicas, configuração inicial da empresa, aprovações de alto impacto (contratos-mãe, política de férias, política de despesas). Herda todas as permissões de Gestor. | Não substitui o Gestor no dia-a-dia; delega operação. |
| **Gestor** | Uma empresa | **Utilizador principal do sistema.** Opera RH, Equipa, Férias, Folha de Ponto, Despesas, Frota, Comercial, Clientes, Contratos. Aprova pedidos operacionais, configura módulos da empresa, exporta relatórios, recebe todas as notificações operacionais. | Não acede à Administração SaaS nem a dados de outras empresas. |
| **Funcionário** | Próprios dados + tarefas atribuídas | Executa tarefas, regista ponto, solicita férias, submete despesas, consulta próprios recibos/contratos/documentos, edita perfil pessoal. | Não aprova, não configura, não vê dados de colegas exceto quando explicitamente partilhado. |

### 1.2 Regra de herança

- **Owner herda tudo do Gestor.** Toda permissão concedida ao Gestor é automaticamente concedida ao Owner na mesma empresa.
- **Super Admin com empresa selecionada herda a visão do Gestor** dessa empresa (mesmas rotas, mesmos widgets, mesmos dados). Sem empresa selecionada (`currentCompanyId = null`), vê apenas o painel SaaS.
- **Funcionário nunca herda** permissões de níveis superiores.

A implementação vive em `src/lib/auth.tsx` (`effectiveRole`). Rotas usam `<RoleGuard allow={[...]}/>`.

---

## 2. Matriz de permissões

Legenda:

- **E** — Executa (usa a funcionalidade no dia-a-dia)
- **A** — Aprova (decisão formal sobre pedidos de terceiros)
- **C** — Configura (define regras, políticas, catálogos)
- **Au** — Audita (visualiza histórico/logs, não altera)
- **X** — Exporta (CSV, PDF, relatórios)
- **N** — Recebe notificação in-app
- **@** — Recebe email transacional
- **—** — Sem acesso
- **h** — Herdado (Super Admin quando `currentCompanyId != null`; Owner sempre em relação ao Gestor)

> Sempre que uma célula do Gestor tem `E/A/C/X/N/@`, o Owner tem `h` e o Super Admin tem `h` (quando `currentCompanyId != null`) e `Au + X` global (quando `currentCompanyId = null`).

| Módulo | Super Admin | Owner | Gestor | Funcionário |
|---|---|---|---|---|
| **Dashboard** | Painel SaaS (KPIs de plataforma) · `Au X` global · `h` ao entrar numa empresa | `h` | `E X` (visão operacional consolidada da empresa) | `E` (visão pessoal: tarefas, ponto, férias, recibos) |
| **RH** | `Au X` global | `h` | `E C X @ N` | — |
| **RH · Recibos** | `Au` | `h` | `E C X @` (publica) | `E X @` (recebe recibo publicado) |
| **Equipa** | `Au X` global | `h` | `E C X N` (convida, edita, arquiva) | `E` limitado ao próprio perfil |
| **Férias** | `Au X` global | `h` | `E A C X N @` | `E N @` (solicita, recebe decisão) |
| **Folha de Ponto** | `Au X` global | `h` | `A C X Au N` (aprova/edita, define política) | `E X` (regista, consulta próprio) |
| **Despesas** | `Au X` global | `h` | `A C X N @` | `E N @` (submete, recebe decisão) |
| **Frota** | `Au X` global | `h` | `E A C X N` (veículos, cartões, abastecimentos) | `E N` (regista abastecimento quando aplicável) |
| **Comercial** | `Au X` global | `h` | `E C X N` | — |
| **Clientes** | `Au X` global | `h` | `E C X` | `E` (leitura quando atribuído) |
| **Contratos** | `Au X` global | `h` (assina como parte quando aplicável) | `E A C X N @` (cria, envia para assinatura, monitoriza) | `E` (leitura quando parte do contrato) |
| **Empresa** | `C` (dados fiscais/tenant) · `Au X` | `E A C X` (dados da própria empresa) | `E C X` (dados operacionais: marca, morada, horários) | — |
| **Administração SaaS** | `E A C X Au N @` (exclusivo) | — | — | — |
| **Assistente IA** | `E` (contexto SaaS) | `h` | `E` (contexto operacional da empresa) | `E` (contexto pessoal) |

### 2.1 Notas por módulo

- **Folha de Ponto:** Funcionário **executa** (regista ponto) mas **não aprova**. Gestor aprova ajustes e edita registos com auditoria obrigatória (`punch-admin`).
- **Férias / Despesas:** o solicitante recebe notificação e email **do próprio pedido** (confirmação + decisão); o aprovador recebe notificação e email **do pedido recebido**.
- **Contratos:** quando o signatário é externo (cliente), o fluxo público de assinatura (`/sign/$token`) não requer perfil OmniBiz.
- **Administração SaaS:** nenhum outro perfil deve ver esta secção no menu, sequer visualmente.
- **Identidade de acesso:** `auth.users.email` é exibido como dado canônico e
  somente leitura. O titular solicita a troca no próprio Perfil; outro utilizador
  autorizado na hierarquia decide o pedido. O UUID não é alterado e toda troca
  concluída gera auditoria de identidade.

---

## 3. Regra oficial para novas funcionalidades

Antes de desenhar qualquer módulo, feature, widget ou notificação, responder **obrigatoriamente**:

> **"Quem utiliza essa funcionalidade diariamente?"**

```
┌─────────────────────────────────────────────────────┐
│ Resposta = Operação da empresa                      │
│    → Destinatário primário = GESTOR                 │
│    → Owner herda automaticamente                    │
│    → Super Admin herda ao selecionar a empresa      │
│    → Funcionário só se explicitamente envolvido     │
├─────────────────────────────────────────────────────┤
│ Resposta = Plataforma SaaS                          │
│   (billing, tenancy, planos, saúde da plataforma)   │
│    → Destinatário = SUPER ADMIN apenas              │
├─────────────────────────────────────────────────────┤
│ Resposta = Colaborador individual                   │
│   (próprio ponto, próprias férias, próprios dados)  │
│    → Destinatário = FUNCIONÁRIO (self)              │
│    → Gestor recebe agregado / notificação de gestão │
└─────────────────────────────────────────────────────┘
```

**Proibido:**
- Enviar emails operacionais para Super Admin como destinatário direto.
- Criar dashboards "para Super Admin" que na verdade são dashboards de operação de empresa.
- Duplicar UI entre Super Admin e Gestor — Super Admin **herda** a UI do Gestor ao selecionar empresa.

---

## 4. Fluxo de notificações

Toda notificação in-app **deve** passar por um dos helpers padronizados abaixo. É proibido enumerar destinatários manualmente dentro de features.

| Helper | Destinatários | Uso |
|---|---|---|
| `notifyManagers(companyId, payload)` | Todos os utilizadores com role `manager` ou `owner` na `companyId` | Eventos operacionais: novo pedido de férias, despesa submetida, ponto pendente de aprovação, contrato assinado, alerta de frota. |
| `notifyOwner(companyId, payload)` | Utilizadores com role `owner` na `companyId` | Eventos estratégicos: mudança de plano, alteração de dados fiscais, atingimento de limite contratual. |
| `notifyEmployees(companyId, filter, payload)` | Funcionários da `companyId` filtrados (equipa, cargo, ids explícitos) | Comunicações da empresa para colaboradores: recibo publicado, política atualizada, ausência aprovada. |
| `notifyApprovers(entity, payload)` | Resolvido dinamicamente pela cadeia de aprovação da entidade (ex.: supervisor direto → gestor de RH) | Fluxos com aprovador variável: férias com supervisor definido, despesas com limite escalonado. |

### 4.1 Regras

- Um evento operacional **sempre** notifica `notifyManagers`. Se o solicitante for funcionário, também recebe `self`.
- Super Admin recebe notificações operacionais in-app destinadas à gestão, preservando o `company_id` do evento para acompanhamento por empresa. Emails operacionais continuam sem Super Admin como destinatário direto.
- Notificações devem sempre incluir: `company_id`, `entity_type`, `entity_id`, `action`, `actor_id`.

---

## 5. Fluxo de emails

### 5.1 Separação obrigatória

| Categoria | Destinatários | Exemplos | Trigger source |
|---|---|---|---|
| **Operacionais** | Gestor, Owner, Funcionário | `vacation_request`, `vacation_approved`, `vacation_rejected`, `vacation_created_by_manager`, `vacation_change_requested`, `payslip_published`, `invite`, `password_reset` | Ação no módulo operacional |
| **SaaS** | Super Admin | Alertas de plataforma, avisos de billing, incidentes de infraestrutura | Eventos da plataforma |

### 5.2 Regras

- Todo email transacional passa por `sendTransactionalEmail()` (`src/lib/email/send.ts`). Sem `fetch` direto para o endpoint de email dentro de features.
- Cada template registado em `src/lib/email-templates/registry.ts` declara implicitamente a sua categoria pelo `triggerSource`.
- Um email operacional **nunca** tem Super Admin como destinatário direto. Se um Super Admin precisa auditar, usa a UI de auditoria (log de emails), não a caixa de entrada.
- Um email SaaS **nunca** é enviado para Gestor/Funcionário.
- Branding (nome, logo, cor) é sempre resolvido a partir da `company_id` do evento — nunca hardcoded.

---

## 6. Critério para futuras implementações

**Nenhum módulo novo poderá ser desenvolvido sem consultar este documento.**

### 6.1 Checklist obrigatório antes de abrir PR de nova feature

1. [ ] Respondi "quem utiliza isto diariamente?" e o destinatário primário está declarado.
2. [ ] A feature aparece na **matriz de permissões** (secção 2) com E/A/C/Au/X/N/@ definidos para cada perfil.
3. [ ] Notificações usam `notifyManagers` / `notifyOwner` / `notifyEmployees` / `notifyApprovers` — nenhum destinatário hardcoded.
4. [ ] Emails passam por `sendTransactionalEmail()` e o template está em `registry.ts`.
5. [ ] Rotas protegidas por `<RoleGuard allow={[...]}/>` coerente com a matriz.
6. [ ] RLS na base de dados espelha a matriz (Gestor/Owner por `company_id`, Funcionário por `auth.uid()`, Super Admin via `has_role`).
7. [ ] Super Admin recebe notificações in-app de gestão como herança operacional/auditoria; não foi adicionado como destinatário direto de emails operacionais.
8. [ ] Se a feature introduz novo perfil ou nova ação — **este documento foi atualizado na mesma PR**.

### 6.2 Governança

- Alterações a este documento requerem revisão explícita do responsável de produto.
- Versão semântica no cabeçalho: `MAJOR` para mudança de hierarquia, `MINOR` para novo módulo/perfil, `PATCH` para clarificações.
- Divergências entre código e este documento são **bug**: o código deve alinhar-se ao documento, ou o documento é atualizado formalmente antes do merge.

---

## Anexo A — Mapeamento código → documento

| Conceito | Local no código |
|---|---|
| Papel efetivo | `src/lib/auth.tsx` → `effectiveRole` |
| Guarda de rota | `src/components/RoleGuard.tsx` |
| Contexto de empresa ativa | `src/lib/auth.tsx` → `currentCompanyId`, `switchCompany` |
| Envio de email | `src/lib/email/send.ts` → `sendTransactionalEmail` |
| Registo de templates | `src/lib/email-templates/registry.ts` |
| Verificação de role em SQL | função `public.has_role(_user_id, _role)` |
| Tabela de papéis | `public.user_roles` (nunca em `profiles`) |

---

**Fim do documento — versão 1.0**
---

## Navegação (ADR-030)

O menu não é uma decisão local de componente: é resolvido por
`resolveAvailableNavigation(context)` em `src/lib/navigation.ts`, consumido por
Desktop e Drawer Mobile. O ramo de atividade é **aditivo** (GERAL + RAMO) e
nunca remove módulos gerais/core. Contexto em carregamento nunca é interpretado
como ausência de permissão. Menu autorizado implica rota autorizada; os guards
(`RoleGuard`, guard de módulo) permanecem obrigatórios no lado da rota.
