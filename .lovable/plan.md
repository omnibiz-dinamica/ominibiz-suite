## Reestruturação do Onboarding OmniBiz

Transformar o fluxo atual (self-signup aberto) em um SaaS controlado, onde apenas o Super Admin cria empresas e convida administradores.

### 1. Banco de dados (migration)

**Ampliar tabela `companies`** com campos operacionais:
- `currency` (text, default 'EUR')
- `language` (text, default 'pt-PT')
- `timezone` (text, default 'Europe/Lisbon')
- País já existe — restringir via CHECK ou validação a `PT`, `BR`, `ES`
- Mudar default de `status` para `active` (super admin já cria ativa)

**Seed do Super Admin**: criar trigger `on_auth_user_created` que detecta `edurts.pt@gmail.com` e insere automaticamente em `user_roles` com role `super_admin` (company_id NULL). Isso resolve o caso de o usuário ainda não existir.

**Nova RPC `admin_create_company_with_invite`** (SECURITY DEFINER, restrita a super_admin):
- Cria a empresa já como `active` com país/moeda/idioma/timezone
- Cria invite com role `manager` para o email do administrador
- Retorna `{ company_id, invite_token }` para o frontend montar o link

**Estrutura inicial automática**: a RPC também insere uma tarefa de boas-vindas (ex: "Configurar sua equipe") para a empresa não abrir vazia.

**Bloquear self-signup**: revogar/remover RPC `create_company_with_owner` ou restringir a super_admin.

### 2. Edge function de envio de email do convite

Criar função `send-invite-email` que:
- Recebe `{ token, email, company_name, inviter_name }`
- Envia email branded via Lovable Emails (após setup) com link `https://app/aceitar-convite?token=...`
- Por enquanto (até DNS), pode logar e retornar o link para copiar

### 3. Frontend

**Remover `/signup`** — redireciona para `/login` com mensagem "OmniBiz é por convite".

**Nova rota `/app/admin`** (super_admin only):
- Dashboard com lista de empresas
- Botão "Criar empresa" → modal com campos: nome, país (select PT/BR/ES), moeda (auto-preenchida), idioma (auto), timezone (auto), email do administrador, nome do administrador
- Após criar: mostra confirmação + link do convite (copiar) e estado do email enviado

**Sidebar**: adicionar item "Super Admin" visível apenas para `isSuperAdmin`.

**Atualizar `/aceitar-convite`**: fluxo simplificado — só pede senha (e nome se ainda não tiver), confirma o convite via RPC `accept_invite` e redireciona direto para `/app` com toast "Bem-vindo a [empresa]".

**Atualizar landing `/`**: remover CTAs de "criar conta", manter apenas "Entrar".

### 4. Sensação de "plataforma pronta"

- Dashboard `/app` já exibe a tarefa de boas-vindas criada automaticamente
- Empresa criada já vem com `status = active` (sem tela de "aguardando aprovação")
- Página `/app/equipe` para o admin convidar funcionários (já existe)

### Detalhes técnicos

- Mapeamento país→moeda/idioma/timezone no frontend (helper):
  - PT → EUR / pt-PT / Europe/Lisbon
  - BR → BRL / pt-BR / America/Sao_Paulo
  - ES → EUR / es-ES / Europe/Madrid
- Email infra: como ainda não há domínio configurado, na primeira versão a função retorna o link do convite para o super admin copiar/enviar manualmente; assim que o usuário configurar domínio, ativamos envio automático.
- Atualizar `src/integrations/supabase/types.ts` é automático após migration.

### Fora do escopo desta entrega

- Configuração completa de domínio de email (depende do usuário)
- Suporte multi-idioma na UI (apenas armazenamos a preferência por enquanto)
- Painel financeiro / faturamento