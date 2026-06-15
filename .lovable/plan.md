## Fase 2 — Plano de execução

Vou entregar em 4 lotes, na ordem que você definiu. Cada lote termina com verificação rápida antes do próximo.

---

### Lote 1 — Correções críticas (estabilidade operacional)

**1.1 Reset de senha (campo bloqueado)**
- Hoje o formulário NÃO tem `disabled` nos inputs, mas o link de recuperação às vezes não dispara o evento `PASSWORD_RECOVERY` no fluxo PKCE do TanStack SSR (token chega como `?code=` em vez de `#access_token=`).
- Correção: detectar `code` na URL e chamar `supabase.auth.exchangeCodeForSession`; mostrar erro claro se o link expirou; manter inputs sempre habilitados.

**1.2 Tarefas — "valor inválido"**
- `wallInputToISO` já normaliza via regex. Resta blindar o submit: validar `scheduledFor`/`scheduledEnd` (formato + fim ≥ início) antes de tocar no Postgres, com mensagens em PT-PT.

**1.3 Notificações de férias**
- Backend já dispara `vacation_requested/approved/rejected/cancelled` via trigger + `vacation_decide`. O bug é só na UI: `EVENT_LABEL` em `app.notificacoes.tsx` não inclui esses eventos, então caem como "undefined".
- Adicionar rótulos `vacation_*` + cor + roteamento de "Abrir" para `/app/ferias`.

**1.4 Fluxo gestor ↔ funcionário (férias)**
- Migration:
  - Adicionar valor `pendente_confirmacao` ao enum `vacation_status`.
  - Nova função `vacation_confirm(_id uuid, _accept boolean, _reason text)` (SECURITY DEFINER) — só o `user_id` pode chamar.
  - Ajustar `vacation_decide.aprovar`: quando o aprovador for diferente do solicitante, gravar status `pendente_confirmacao` e notificar o funcionário (`vacation_confirmation_required`).
  - Quando o próprio funcionário criou e o gestor aprovou, mantém `aprovado` direto.
- UI `app.ferias.tsx`: nova seção "Aguardando minha confirmação" com botões Aceitar/Recusar (com motivo opcional).

---

### Lote 2 — Exportação Clientes (Excel + PDF)

- Libs: `xlsx` (SheetJS) para `.xlsx`, `jspdf` + `jspdf-autotable` para PDF. Ambas client-side (sem server function), respeitam RLS pois usam os dados já carregados.
- Campos: Nome, Contacto, Email, Telefone, Morada, Tipo de cobrança, Valor fixo, Valor por hora, Status.
- Filtros ativos da tela são aplicados antes do export (mesma lista visível).
- Branding: header do PDF com nome + cor primária da empresa (`companies.primary_color`), rodapé com data e total de registos. Excel com cabeçalho em negrito.
- Botões: "Exportar Excel" e "Exportar PDF" na barra de ações da tela Clientes.
- Este módulo vira o **padrão visual** reutilizável (`src/lib/exports/`): `exportToExcel(rows, columns, meta)` e `exportToPdf(rows, columns, meta)`.

---

### Lote 3 — Exportação Gestão de Ponto (Excel + PDF)

- Reusa `src/lib/exports/` do Lote 2.
- Colunas: Funcionário, Data, Entrada, Saída, Pausas, Horas totais, Cliente/tarefa, Modo (auto/manual), Origem, Notas.
- Filtros existentes da tela (período/colaborador) aplicados.
- Mesmo cabeçalho branded do Lote 2.

---

### Lote 4 — Melhorias Férias

- Já tratado parcialmente no Lote 1 (`pendente_confirmacao`).
- Restante:
  - Filtros: colaborador (select), mês (date picker), local de trabalho (input), apenas dias úteis (toggle que recalcula dias).
  - Coluna "Dias úteis" no histórico/aprovadas (segunda a sexta, sem feriados — feriados ficam para fase futura).
  - Badge "Pendente de confirmação" com cor própria.

---

### Auditoria final

Ao concluir, entrego tabela item-por-item:

| Requisito | Estado | Evidência |
|---|---|---|
| Reset senha | IMPLEMENTADO / CORRIGIDO | arquivo + linha alterada |
| Tarefas valor inválido | CORRIGIDO | … |
| ... | ... | ... |

---

### O que NÃO faço (você pediu para fechar bugs antes)

- Nada de assinatura eletrónica, app móvel, financeiro, inventário, contratos PDF, etc. nesta fase.
- Sem novos módulos.

---

**Confirma esta ordem e a escolha de libs (`xlsx` + `jspdf`/`jspdf-autotable`) para exportação? Posso começar pelo Lote 1 imediatamente.**