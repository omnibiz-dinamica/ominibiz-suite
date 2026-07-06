# OmniBiz — CHANGELOG

> Registro oficial de alterações. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
> Versionamento segue as releases documentadas em `docs/RELEASE_HISTORY.md`.

---

## [Não lançado] — Sprint de Refinamento Operacional

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