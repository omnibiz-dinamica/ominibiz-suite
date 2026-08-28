# OmniBiz - Mapa Estrutural do Frontend

**Data:** 2026-08-28  
**Modo:** somente leitura

## Estrutura observada

```text
src/
├── routes/          69 arquivos de rota TanStack Router
├── components/      95 arquivos; UI compartilhada e componentes por dominio
├── lib/             61 arquivos; auth, navegacao, tarefas, ponto, suporte, mapas
├── hooks/            hooks compartilhados
├── integrations/    cliente Supabase e integracoes
└── routeTree.gen.ts arvore gerada de rotas
```

## Rota shell e identidade

`src/routes/app.tsx` autentica o utilizador e monta `AppLayout`. `src/lib/auth.tsx` carrega `get_auth_context()`, `profiles`, papeis e `current_company_id`; `switchCompany()` chama `set_current_company()`. `effectiveRole` resolve Super Admin, Owner, Gestor, Contabilista, Secretario e Funcionario.

## Navegacao dinamica

`src/lib/navigation.ts` e a fonte canonica de menus Desktop e Drawer Mobile. `resolveAvailableNavigation()` combina papel, empresa ativa, vertical e `enabled_modules`; os itens com `module` sao filtrados por `isModuleEnabled()`. A regra documentada e aditiva: o vertical acrescenta grupo e nao remove o Core.

`src/components/AppLayout.tsx` usa esse resolver, aguarda o contexto antes de renderizar o menu e redireciona quando a rota mapeada em `moduleForPath()` esta desativada.

## Guards

- `RoleGuard` existe e e usado explicitamente nas rotas de Material de Construcao e em varias rotas administrativas.
- `ModuleGuard` e usado nas 11 rotas de Material de Construcao.
- As 8 rotas `src/routes/app.restaurante.*.tsx` possuem `RoleGuard`, mas nao `ModuleGuard`.
- Essas rotas de Restaurante exibem `ComingSoon`; no estado atual sao placeholders, mas URL direta nao fica bloqueada pelo modulo.
- A protecao real continua dependendo de RLS/RPC no backend; esconder menu nao e considerado seguranca.

## Rotas por dominio

### Core e Limpeza

`app.index`, `app.tarefas`, `app.tarefas.recorrentes`, `app.ponto`, `app.ponto_.gestao`, `app.ponto_.fechamento`, `app.ponto_.meus-relatorios`, `app.equipe`, `app.ferias`, `app.despesas`, `app.clientes`, `app.frota`, `app.frota.cartoes`, `app.rh`, `app.rh.recibos`, `app.meus-recibos`, `app.notificacoes`, `app.empresa`, `app.suporte` e o detalhe de ticket formam o núcleo operacional existente.

### Comercial/SaaS

`app.comercial`, `app.comercial.clientes`, `app.comercial.contratos`, `app.comercial.contratos.novo`, `app.comercial.contratos.$id` e templates cobrem contratos, clientes comerciais e workflow de implantacao. O backend destas tabelas e Super Admin-only, nao um CRM multiempresa operacional.

### Restaurante

`app.restaurante.index`, `menu`, `mesas`, `pedidos`, `cozinha`, `delivery`, `entregadores`, `zonas`. Todas as 8 telas sao `ComingSoon`, sem chamadas de dados observadas.

### Material de Construcao

`app.material-construcao.index`, `produtos`, `estoque`, `categorias`, `fornecedores`, `compras`, `orcamentos`, `vendas`, `clientes`, `entregas`, `financeiro`. Todas as 11 telas sao `ComingSoon`, embora protegidas pelo `ModuleGuard`.

### Verticais futuras

Nao foram encontradas rotas de Hotelaria ou Oficina. Elas existem somente como valores aceitos de `business_vertical` e abas sem submodulos no catalogo.

## Estado e dados

- TanStack Query e usado para cache/invalidation.
- Realtime compartilhado esta documentado em `src/lib/realtime/subscribe.ts`; ainda ha historico de migracao gradual.
- `src/lib/events/` e scaffold, sem `domain_events` live confirmado.
- Uploads passam por Supabase Storage e signed URLs em pontos sensiveis.
- O frontend contem o cliente publishable/anon; nao foi encontrada service role em variaveis `VITE_*`.

## Achados de frontend

| Area | Status | Evidencia |
|---|---|---|
| Contexto empresa e papel | 🟢 PRONTO | `auth.tsx`, `get_auth_context`, `set_current_company` |
| Resolver unico de menu | 🟢 PRONTO | `lib/navigation.ts`, `AppLayout.tsx` |
| Guard Material | 🟢 PRONTO | 11 rotas com RoleGuard + ModuleGuard |
| Guard Restaurante | 🟡 INCOMPLETO | 8 rotas sem ModuleGuard; KI-028 |
| Telas Restaurante | 🟡 INCOMPLETO | somente `ComingSoon` |
| Telas Material | 🟡 INCOMPLETO | somente `ComingSoon` |
| Hotelaria/Oficina | 🔴 INEXISTENTE | sem rotas operacionais |
| Mobile | 🟡 INCOMPLETO | layout responsivo e fluxos Android existentes, mas sem suite E2E completa nesta auditoria |

