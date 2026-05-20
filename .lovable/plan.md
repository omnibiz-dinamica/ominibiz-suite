# Segregação real por papel — OmniBiz

Hoje os três papéis veem praticamente o mesmo shell. Vou separar **backend + frontend** para que cada papel tenha uma experiência distinta, com proteção real de RLS e rotas.

## 1. Backend (RLS + funções)

Auditar e ajustar para garantir:

- **funcionário** só vê/edita **as próprias tarefas**, **próprias notificações**, **próprio ponto**, **próprio perfil**.
  - Bloquear `SELECT` em `clients`, `companies`, `user_roles`, `profiles` de terceiros, `time_entries` de outros, `tasks` de outros.
  - Hoje `clients` permite `members view company clients` (qualquer membro). Trocar para apenas managers + super_admin.
  - `companies` permite `members view their company` — manter (funcionário precisa do nome da empresa), mas remover qualquer leitura cruzada.
  - `time_entries` já está OK (user vê só os próprios; managers veem da empresa).
- **gestor** opera dentro da **própria empresa** (já está via `is_company_manager`).
- **super_admin** mantém acesso global mas **não cria tarefas operacionais** (regra de UI; backend continua permitindo para auditoria).
- Adicionar policy explícita: funcionário **não** vê `user_roles` de outros (hoje vê só os próprios — OK).

## 2. Auth context (frontend)

`AuthProvider` já carrega `user`, `roles`, `currentCompanyId`, `profile` antes do render (`initialized + loading`). Vou:

- Derivar um `role` efetivo: `super_admin` > `manager` > `employee`.
- Expor `isEmployee`, `isManager`, `isSuperAdmin` consistentes.
- O `AppShell` continua bloqueando render até `initialized`.

## 3. Rotas (proteção real, não só menu)

Criar guards em cada rota sensível usando o context. Em vez de só esconder no menu, cada rota faz check e redireciona:

- **Funcionário** só pode acessar: `/app` (dashboard simplificado), `/app/tarefas`, `/app/ponto`, `/app/notificacoes`, `/app/perfil`.
- **Gestor** acessa tudo da empresa, **menos** `/app/admin`.
- **Super admin** acessa `/app/admin` + visão global. Páginas operacionais (tarefas/clientes/equipe) ficam **somente leitura/auditoria** para super_admin.

Implementação: helper `<RoleGuard allow={['manager','super_admin']}>` que renderiza children ou redireciona para `/app`.

## 4. Shell e menu por papel

`AppLayout` passa a montar **3 menus diferentes** (não um menu único filtrado):

- **Super admin**: Dashboard Global, Empresas, Auditoria, Configurações SaaS, Perfil.
- **Gestor**: Dashboard, Tarefas, Ponto, Notificações, Clientes, Usuários, Empresa, Notas, Assistente, Perfil.
- **Funcionário**: Minha Operação (ponto), Minhas Tarefas, Notificações, Perfil.

## 5. Dashboards distintos

`/app` (index) detecta o papel e renderiza componente específico:

- `SuperAdminDashboard` — métricas globais (total empresas, usuários, tarefas no SaaS).
- `ManagerDashboard` — atual (operação da empresa).
- `EmployeeDashboard` — só as próprias tarefas de hoje + botão "Bater ponto".

## 6. Páginas

- `/app/tarefas`: funcionário vê lista enxuta só das suas; sem botões de criar/atribuir/cancelar (só iniciar/pausar/concluir/solicitar autorização).
- `/app/clientes`, `/app/equipe`, `/app/empresa`: redirecionar funcionário para `/app`.
- `/app/admin`: redirecionar não-super para `/app`.
- Criar `/app/perfil` (faltava) com dados do próprio usuário.

## 7. Páginas marcadas "em breve" (Férias, Frota, Filiais)

Não vou criar agora — fora do escopo desta correção. Mantenho menu coerente sem itens fantasma.

## Detalhes técnicos

- Sem mudança em `auth.tsx` além de pequenos helpers.
- Novo: `src/components/RoleGuard.tsx`, `src/components/dashboards/{Employee,SuperAdmin}Dashboard.tsx`, `src/routes/app.perfil.tsx`.
- Refactor: `AppLayout.tsx` (menus por papel), `app.index.tsx` (switch de dashboard), `app.tarefas.tsx` (modo funcionário), guards nas rotas restritas.
- Migration: tightening RLS em `clients` (remover leitura para `employee`).

## Fora do escopo

- Implementar Férias/Frota/Filiais (só estrutura de menu).
- Auditoria detalhada / logs SaaS.
- Painel "Configurações SaaS" — placeholder.
