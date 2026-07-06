# Relatório Técnico — Cache de Nome de Cliente (Item 14)

> **Fase:** 1 · **Data:** 2026-07-06 · **Tipo:** Diagnóstico (sem código)
> **KI relacionado:** [KI-002](./KNOWN_ISSUES.md)

## 1. Sintoma

Após renomear cliente em `/app/clientes`, telas secundárias continuam mostrando o nome antigo até refresh manual.

## 2. Mapa de queryKeys

Auditoria via `rg 'queryKey.*client'` revela **7 chaves distintas** para dados de cliente:

| # | queryKey | Arquivo | Uso |
|---|---|---|---|
| 1 | `["clients", companyId, isManager, userId]` | `src/routes/app.clientes.tsx:76` | Lista principal |
| 2 | `["client-assignees", companyId]` | `src/routes/app.clientes.tsx:90` | Atribuições |
| 3 | `["clients-min", companyId]` | `src/routes/app.tarefas.tsx:121` | Dropdown em tarefa |
| 4 | `["clients-map", companyId]` | `src/routes/app.ponto.tsx:144` | Mapa da folha de ponto |
| 5 | `["punch-admin-clients-filter", companyId]` | `src/routes/app.ponto_.gestao.tsx:108` | Filtro gestão |
| 6 | `["commercial_clients"]` | `src/routes/app.comercial.clientes.tsx:61` | Módulo Comercial |
| 7 | `["wizard-clients"]` | `src/routes/app.comercial.contratos.novo.tsx:39` | Wizard de contrato |

## 3. Comportamento atual da mutation

`src/routes/app.clientes.tsx` linhas 161, 175, 288-289:

```ts
qc.invalidateQueries({ queryKey: ["clients"] });
qc.invalidateQueries({ queryKey: ["client-assignees"] });
```

**Invalida apenas 2 dos 7 keys.** Os outros 5 permanecem em cache com o valor antigo.

## 4. Causa raiz

- Nomes de queryKey inconsistentes (`clients` vs `clients-min` vs `commercial_clients`) impedem invalidação por prefixo comum.
- Não existe helper central; cada tela reinventa o key.
- Nenhum canal Realtime na tabela `clients` para propagar mudanças automaticamente.

## 5. Solução proposta (Fase 3)

### 5.1 Helper central

`src/lib/clients-cache.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";

export const CLIENT_QUERY_KEYS = [
  "clients",
  "client-assignees",
  "clients-min",
  "clients-map",
  "punch-admin-clients-filter",
  "commercial_clients",
  "wizard-clients",
] as const;

export function invalidateClientCaches(qc: QueryClient) {
  return Promise.all(
    CLIENT_QUERY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })),
  );
}
```

### 5.2 Uso

Substituir todas as invalidations de cliente por `invalidateClientCaches(qc)`.

### 5.3 Realtime opcional (Fase 5)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
```

Subscribe único em `__root.tsx` que dispara `invalidateClientCaches` ao receber `UPDATE`. Elimina a necessidade de invalidação manual.

## 6. Alternativas descartadas

| Alternativa | Motivo da rejeição |
|---|---|
| Uniformizar todas para `["clients"]` | Cada tela projeta colunas diferentes; unificação perderia otimizações |
| Invalidar `queryKey: []` (global) | Refetch massivo de dados não relacionados |
| `refetchOnWindowFocus: always` | UX ruim, custo alto |
| Denormalizar `client_name` em `tasks` | Cria mais pontos de sincronização; piora o problema |

## 7. Impacto

- **Correção:** imediata após mutation, sem espera.
- **Custo:** 7 requests em vez de 2 (poucos KB cada).
- **Risco:** baixo — invalidations são idempotentes.

**Recomendação: aprovar para Fase 3.**