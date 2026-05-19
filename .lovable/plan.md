## Diagnóstico objetivo encontrado

O `src/lib/auth.tsx` hoje faz este fluxo:

```text
AuthProvider monta
  -> loading = true
  -> supabase.auth.getSession()
      -> applySession(session)
          -> setSession(session)
          -> se user existe:
              setLoading(true)
              setTimeout(0)
                -> loadProfile(user.id)
                    -> supabase.rpc("get_auth_context")
                    -> lê row.current_company_id
                    -> lê row.roles
                    -> setRoles(...)
                    -> setCurrentCompanyId(...)
              -> finally setLoading(false)
          -> se user não existe:
              setRoles([])
              setCurrentCompanyId(null)
              setLoading(false)

  -> supabase.auth.onAuthStateChange(...)
      -> ignora INITIAL_SESSION
      -> para outros eventos chama applySession(session)
```

## Causa provável da quebra no frontend

1. **Ordem incorreta do listener de sessão**
   - O padrão seguro é registrar `onAuthStateChange()` antes de chamar `getSession()`.
   - O arquivo atual faz o contrário: chama `getSession()` antes e só depois registra o listener.
   - Isso abre janela de corrida no login/navegação, principalmente porque `/login` faz `signInWithPassword()` e navega imediatamente para `/app`.

2. **Race condition real em `applySession()`**
   - `loadId` é usado para controlar corrida, mas ele só impede `setLoading(false)` antigo.
   - Ele **não impede** um `loadProfile()` antigo de executar `setRoles([])` e `setCurrentCompanyId(null)` no `catch`, nem impede `setRoles/setCurrentCompanyId` de uma chamada antiga.
   - Resultado possível: `get_auth_context()` pode retornar certo, mas depois um evento antigo/erro antigo sobrescreve o estado React.

3. **Estado incompleto para diagnosticar**
   - O contexto não tem `initialized` nem `profile`.
   - Só existem `session`, `loading`, `roles`, `currentCompanyId`.
   - Por isso a UI não consegue distinguir:
     - “ainda carregando auth”
     - “logado mas contexto ainda não carregou”
     - “RPC falhou”
     - “sem empresa de verdade”

4. **Queries das telas podem rodar cedo demais**
   - Exemplo: `src/routes/app.index.tsx` habilita dashboard com `enabled: !!user`.
   - Se `user` já existe mas `currentCompanyId` ainda não foi carregado, a query roda antes do contexto operacional estar pronto.
   - Para super admin isso pode virar consulta ampla ou estado visual inconsistente.

## O que vou alterar

### 1. Instrumentar `src/lib/auth.tsx` com logs temporários detalhados
Adicionar logs com prefixo único, por exemplo `[auth-flow]`, mostrando:

```text
provider mounted
listener registered
getSession start/end
onAuthStateChange event
applySession start
loadProfile start
rpc get_auth_context success/error
parsed roles/currentCompanyId
state commit skipped/applied
loading false
```

Também logar snapshots seguros:

```text
loading
initialized
user id/email
roles
currentCompanyId
isSuperAdmin
isManager
```

### 2. Corrigir a ordem do fluxo auth
Reestruturar o `useEffect` para:

```text
1. registrar onAuthStateChange primeiro
2. chamar getSession depois
3. aplicar sessão com controle de versão único
4. só finalizar loading quando a chamada atual terminar
```

### 3. Tornar `loadProfile()` imune a chamadas antigas
Alterar `loadProfile` para retornar dados, sem fazer `setState` diretamente.

Novo modelo:

```text
loadAuthContext(user)
  -> rpc get_auth_context
  -> retorna { roles, currentCompanyId }

applySession(session)
  -> cria requestId
  -> chama loadAuthContext
  -> antes de setState confere se requestId ainda é o atual
  -> só então aplica roles/currentCompanyId/loading
```

Isso remove a causa onde uma chamada antiga sobrescreve estado novo.

### 4. Adicionar `initialized` e `profile` no AuthContext
Sem mock, sem hardcode, sem fallback fake.

`profile` será carregado do banco real após o RPC, usando o `current_company_id` retornado, ou opcionalmente adicionado como leitura direta segura:

```text
profiles.select("id, full_name, current_company_id, is_active, created_at, updated_at")
  .eq("id", user.id)
  .maybeSingle()
```

Se essa leitura falhar por RLS, o erro será logado explicitamente; não será mascarado como estado vazio.

### 5. Ajustar gates das telas principais
Onde a tela depende de empresa operacional, trocar `enabled: !!user` por condição baseada no contexto carregado:

```text
enabled: initialized && !!user && (!!currentCompanyId || !isManager)
```

No dashboard, evitar query operacional antes do `currentCompanyId` estar definido para manager/super admin.

### 6. Resultado esperado nos logs
Após login com `edurts.pt@gmail.com`, a sequência esperada deve ficar:

```text
[auth-flow] provider mounted
[auth-flow] listener registered
[auth-flow] getSession:start
[auth-flow] auth event SIGNED_IN/TOKEN_REFRESHED/INITIAL_SESSION
[auth-flow] applySession:start user=edurts.pt@gmail.com requestId=N
[auth-flow] get_auth_context:start requestId=N
[auth-flow] get_auth_context:success currentCompanyId=e83a... roles=[super_admin]
[auth-flow] profile:success current_company_id=e83a...
[auth-flow] state:commit requestId=N loading=false initialized=true
```

## Arquivos a alterar

- `src/lib/auth.tsx`
  - Corrigir fluxo, logs, controle de corrida, `initialized`, `profile`.

- Possivelmente `src/routes/app.tsx`
  - Usar `initialized/loading` corretamente para não renderizar app antes do contexto auth estar pronto.

- Possivelmente `src/routes/app.index.tsx`
  - Evitar query de dashboard antes de carregar `currentCompanyId`.

## Critério de sucesso

- `get_auth_context()` chamado exatamente pelo cliente autenticado.
- Retorno não descartado.
- `current_company_id` aplicado no React context.
- `roles` contém `super_admin`.
- Nenhum evento antigo consegue sobrescrever estado novo.
- As telas só consultam dados operacionais depois do contexto auth estar inicializado.