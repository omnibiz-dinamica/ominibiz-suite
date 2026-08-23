# Release Notes — Vertical Material de Construção (Fase A)

Data: 2026-08-23 · ADR-033 · Regra: **zero regressão no módulo de Limpeza**

## 1. Migration aplicada

CHECK **anterior**:
```
CHECK (business_vertical = ANY (ARRAY['cleaning_services','restaurant_delivery','generic']))
```
CHECK **novo**:
```
CHECK (business_vertical = ANY (ARRAY['cleaning_services','restaurant_delivery','generic',
                                      'building_materials','hospitality','auto_repair']))
```
Características: bloco `DO` idempotente, valida os valores existentes antes de recriar
o CHECK (aborta se encontrar valor fora da lista) e **não executa nenhum UPDATE**.

## 2. Empresas após a migration (query de prova)

| Empresa | business_vertical | enabled_modules | módulos `building_materials_*` |
|---|---|---|---|
| Dinâmica Solução | restaurant_delivery | core, tasks, time_clock, hr, support, crm, fleet, finance | 0 |
| Grupo V-clean | restaurant_delivery | core, tasks, time_clock, hr, support, crm, fleet, finance, whatsapp_ai, bi_advanced, ai_automations, notes | 0 |
| OMNIBIZ DRYRUN 1783762885 | cleaning_services | core, tasks, time_clock, hr, support, crm, fleet, finance | 0 |
| OMNIBIZ TESTES | cleaning_services | core, tasks, time_clock, hr, support, crm, fleet, finance | 0 |

**Confirmado: zero empresas receberam módulos `building_materials_*`.**
`DEFAULT_ENABLED_MODULES` permanece inalterado.

## 3. Ficheiros alterados / criados

- `src/lib/locale.ts` — 11 módulos `building_materials_*`, novos verticais,
  `BUILDING_MATERIALS_MODULES`, `BUILDING_MATERIALS_ROUTE_MODULES`, aba de módulos.
- `src/components/ModuleGuard.tsx` — **novo** (guard canónico, 403).
- `src/lib/navigation.ts` — grupo de menu aditivo "Material de Construção".
- `src/routes/app.material-construcao.*.tsx` — 11 rotas novas.
- `src/routes/app.admin.tsx` — aba do vertical; sem ativação automática de módulos.
- Docs: `DECISIONS.md` (ADR-033), `CHANGELOG.md`, `KNOWN_ISSUES.md`, este ficheiro.

## 4. Funcionamento do ModuleGuard

1. Resolve `companies.enabled_modules` da empresa ativa.
2. Enquanto o contexto carrega mostra "Carregando..." — nunca 403 prematuro (ADR-030).
3. Sem empresa ativa ou sem o módulo → ecrã 403 "Módulo não disponível".
4. Renderiza os filhos apenas quando o módulo está efetivamente ativo.

## 5. Testes executados (Playwright, gestor real da OMNIBIZ TESTES)

| Teste | Resultado |
|---|---|
| URL direta `/app/material-construcao` com módulo desativado | 403 ✅ |
| URL direta `/app/material-construcao/produtos` com módulo desativado | 403 ✅ |
| Grupo de menu "Material de Construção" com módulos desativados | não aparece ✅ |
| Contexto controlado com `building_materials_dashboard` + `_products` ativos | acesso permitido ✅ |
| No mesmo contexto, `/estoque` (módulo não ativo) | 403 ✅ |
| Regressão Limpeza: `/app/tarefas`, `/app/clientes`, `/app/ponto`, `/app/equipe` | tudo acessível, sem 403 ✅ |

## 6. Análise de impacto nas rotas de Restaurante

Hoje as rotas `/app/restaurante/*` usam apenas `RoleGuard` + `ComingSoon` e **não**
constam de `ROUTE_MODULES`, logo o acesso por URL direta não é bloqueado (só o menu
esconde os itens). Grupo V-clean e Dinâmica Solução estão marcadas como
`restaurant_delivery` sem nenhum módulo `restaurant_*` ativo — anomalia pré-existente.

Se o `ModuleGuard` fosse aplicado agora a essas rotas, essas duas empresas passariam
de ecrã "Em breve" para 403. Nenhum dado operacional seria perdido (as páginas são
placeholders), mas é uma alteração de comportamento visível e desnecessária nesta
fase. **Decisão: não aplicar**; o gap fica documentado para auditoria dedicada.

## 7. Qualidade

- Typecheck: OK
- Build: OK
- Verticais Hotelaria e Oficina: preparados, sem menus nem rotas operacionais.
