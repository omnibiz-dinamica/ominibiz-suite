# OmniBiz — CHANGELOG

> Registro oficial de alterações. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
> Versionamento segue as releases documentadas em `docs/RELEASE_HISTORY.md`.

---

## [Não lançado] — Sprint de Refinamento Operacional

### Fase 3 — Correções P0 (2026-07-06)

#### Corrigido
- **KI-001 · Geocoding `REQUEST_DENIED`:** geocoding direto e reverso migrados para server functions (`geocodeAddressFn`, `reverseGeocodeFn` em `src/lib/maps/geocoding.functions.ts`) que chamam o Lovable Connector Gateway (`google_maps`). Segredos (`LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY`) permanecem exclusivamente server-side. O provider `google.ts` foi atualizado internamente; contrato `MapProvider` preservado (retrocompatível).
- **KI-002 · Cache de Clientes desatualizado:** criado helper central `invalidateClientsCache(qc)` em `src/lib/cache/clients.ts`. Todas as mutations e subscribers Realtime em `src/routes/app.clientes.tsx` migrados para o helper — nenhuma invalidação avulsa restante para prefixos de `public.clients`.

#### Decisões arquiteturais
- ADR-009 — Geocoding server-side via Lovable Connector Gateway.
- ADR-010 — Cache central de Clientes (`invalidateClientsCache`).

#### Documentação
- `docs/KNOWN_ISSUES.md`: KI-001 e KI-002 marcados **Resolvidos**.
- `docs/DECISIONS.md`: adicionadas ADR-009 e ADR-010.

#### Compatibilidade
- Nenhuma alteração em banco, RLS, RBAC ou RPCs.
- Contrato `MapProvider.geocode/reverseGeocode` inalterado.
- Nenhum novo segredo — reuso das credenciais já injetadas pelo conector Google Maps Platform.

---

### Fase 2 — Correções triviais (2026-07-06)

#### Adicionado
- `docs/CHANGELOG.md` como documento oficial do projeto.
- Item 05 · Dashboard clicável: os cartões "Pendentes / Em andamento / Concluídas / Atrasadas" e cada linha de "Próximas tarefas" agora navegam para `/app/tarefas`. Adicionado botão "Ver todas". Estados de hover, foco visível e `aria-label` descritivo (`src/routes/app.index.tsx`).
- Item 15 · Proteção contra tradução automática: `<html lang="pt-BR" translate="no" className="notranslate">` e `<meta name="google" content="notranslate">` em `src/routes/__root.tsx`, corrigindo `Hydration failed` provocado pela tradução do Chrome/Edge.

#### Verificado (sem alteração de código)
- Item 10 · Recorrência HH:MM: inputs de horário já utilizam `type="time"` (HH:MM nativo) em `RecurrenceForm.tsx` e `EditRecurrenceDialog.tsx`. Persistência normaliza para `HH:MM:00`; exibição em `app.tarefas.recorrentes.tsx` usa `slice(0,5)`. Nenhum ajuste necessário — comportamento em conformidade.
- Item 13 · Fluxo de férias (UI): revisão realizada em `src/routes/app.ferias.tsx`. Nenhuma alteração aplicada nesta fase; refinamentos maiores foram reclassificados para Fase 5 conforme princípios arquiteturais (auditoria + realtime) definidos em `docs/ARCHITECTURE_PRINCIPLES.md`.

#### Documentação
- `docs/KNOWN_ISSUES.md`: registrados KI-005 (Dashboard) e KI-006 (Tradução automática) como Resolvidos.

#### Compatibilidade
- Nenhuma alteração em banco, RLS, RBAC, RPCs ou contratos de dados.
- Nenhuma alteração em componentes reutilizáveis (apenas rota do Dashboard e shell raiz).
- 100% retrocompatível com a Fase 1 e com todos os módulos homologados.

---

## [v1.0] — Geolocalização (Produção Aprovada)

Consulte `docs/RELEASE_NOTES_GEOFENCING_v1.0.md` e `docs/RELEASE_HISTORY.md`.