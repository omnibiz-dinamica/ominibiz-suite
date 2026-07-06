# OmniBiz — Known Issues

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

## KI-001 — Geocoding retorna `REQUEST_DENIED`

- **Severidade:** 🟠 Alta
- **Módulo:** Mapas / Clientes
- **Status:** Em análise (Fase 1)
- **Detectado em:** 2026-07-05
- **Origem:** relatório do sprint de refinamento (item 16)

**Sintoma:** Ao editar cliente e buscar endereço, console mostra `geocode: REQUEST_DENIED`. Endereço não é resolvido.

**Causa raiz confirmada:** `src/lib/maps/providers/google.ts:178` chama `google.maps.Geocoder()` (SDK JS, browser key). A browser key da Lovable é restrita por referrer e autoriza apenas **Maps JavaScript API** e **Places API (New)**. Chamadas ao **Geocoding API** são rejeitadas por design.

**Impacto:** Cadastro de cliente sem coordenadas manuais fica sem endereço legível; geofencing ainda funciona com clique manual no mapa.

**Workaround:** clicar diretamente no mapa para fixar as coordenadas.

**Correção planejada (Fase 3):** mover geocoding para server function via gateway `connector-gateway.lovable.dev/google_maps/maps/api/geocode/json` com headers `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key`. Detalhes em `docs/RELATORIO_GEOCODING.md`.

---

## KI-002 — Cache de nome de cliente desatualizado em telas secundárias

- **Severidade:** 🟠 Alta
- **Módulo:** Clientes
- **Status:** Em análise (Fase 1)
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

**Correção planejada (Fase 3):** helper central `invalidateClientCaches(qc, companyId)` que invalida todos os 7 keys, chamado após qualquer mutation em `clients`. Detalhes em `docs/RELATORIO_CACHE_CLIENTES.md`.

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