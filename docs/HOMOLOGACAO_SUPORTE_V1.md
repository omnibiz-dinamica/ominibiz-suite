# Homologação — Central de Suporte V1 (Painel Operacional)

Data: 2026-07-16
Escopo: refinamento operacional do painel do Super Admin (Fase 1.1).
Sem alteração de RLS, schema de dados, UUIDs ou histórico.

## 1. Alterações incluídas

- **Migration**: cria `public.get_support_ticket_requester_info(uuid)` — RPC
  `SECURITY DEFINER` que devolve nome do solicitante, email e nome da
  empresa, com o mesmo predicado de acesso já aplicado por RLS em
  `support_tickets`.
- **UI**: `src/routes/app.suporte.$id.tsx` e
  `src/routes/app.admin.suporte.tsx` reescritos para expor todos os
  dados necessários ao atendimento operacional (dados gerais, local do
  erro, contexto técnico, anexos com preview, timeline unificada,
  respostas rápidas, filtros e KPIs).
- **Constantes**: `src/lib/support/constants.ts` — `PRIORITY_ORDER`,
  `QUICK_REPLIES`, `EVENT_TYPE_LABEL` e cores de prioridade Sara.

## 2. Matriz de verificação

| # | Cenário | Perfil | Resultado esperado |
|---|---|---|---|
| 1 | Abrir ticket como Gestor | manager | Ticket criado com número `SUP-YYYY-NNNNNN` |
| 2 | Super Admin visualiza detalhe | super_admin | Bloco *Dados gerais* mostra empresa + solicitante + email |
| 3 | Descrição extensa | super_admin | Texto exibido íntegro, com quebra de linha; botão *copiar* copia título+descrição |
| 4 | Local do erro | super_admin | Módulo/rota/URL visíveis; URL abre em nova aba |
| 5 | Contexto técnico | super_admin | Collapsible mostra build/commit/ambiente/navegador/SO/resolução/timezone |
| 6 | Anexos: imagem | super_admin | Miniatura renderizada via signed URL |
| 7 | Anexos: PDF | super_admin | Ícone PDF; abrir em nova aba via signed URL |
| 8 | Anexos: download | super_admin | Botão download força `a[download]` sobre signed URL |
| 9 | Timeline | super_admin | Eventos + mensagens em ordem cronológica com rótulos humanos |
| 10 | Nota interna | super_admin | Só visível ao super admin; Gestor não vê |
| 11 | Nota interna — Gestor | manager | Ausente da lista de mensagens |
| 12 | Respostas rápidas | super_admin | Cada botão adiciona o template ao textarea |
| 13 | Alterar status | super_admin | Evento `status_changed` gerado |
| 14 | Alterar prioridade | super_admin | Cores atualizam (urgente=vermelho, alta=laranja, normal=azul, baixa=cinza) |
| 15 | Filtro Empresa | super_admin | Lista filtra e URL não expõe email |
| 16 | Filtro Intervalo de datas | super_admin | Aplica `gte/lte` sobre `created_at` |
| 17 | Ordenação FIFO | super_admin | Dentro da prioridade, mais antigos vêm primeiro |
| 18 | KPI-cards clicáveis | super_admin | Cada card aplica o filtro correspondente |
| 19 | Métricas médias | super_admin | Mostra 1ª resposta e resolução |
| 20 | Reabrir ticket (Gestor) | manager | Habilitado até 7 dias após `closed_at` |
| 21 | Reabrir ticket (SA) | super_admin | Sempre habilitado |
| 22 | Funcionário sem acesso | employee | `RoleGuard` bloqueia `/app/suporte` e `/app/admin/suporte` |
| 23 | Gestor em `/app/admin/suporte` | manager | `RoleGuard` bloqueia |
| 24 | Responsividade | — | Desktop + tablet + mobile: grid colapsa, sidebar vira coluna |

## 3. Segurança validada

- **RLS**: nenhuma política alterada. `support_tickets`,
  `support_ticket_messages`, `support_ticket_attachments`,
  `support_ticket_events` mantêm predicados originais.
- **RBAC / RoleGuard**: `/app/admin/suporte` continua restrito a
  `super_admin`; `/app/suporte` e `/app/suporte/$id` a
  `super_admin|owner|manager`.
- **Storage**: nenhum acesso público. Sempre `createSignedUrl` no
  bucket `support-ticket-attachments` (900s p/ preview, 300s p/
  download).
- **Email do solicitante**: acessado apenas na RPC `SECURITY DEFINER`
  com verificação de papel/empresa.

## 4. Auditoria

Nenhum registro é apagado. Todas as ações de escrita continuam a
gerar linhas em `support_ticket_events` (append-only trigger). Leitura
de anexo NÃO é auditada nesta fase — registrado em `KNOWN_ISSUES`
como pendência para a Fase 2 (KI-026).

## 5. Riscos residuais

- **KI-026**: templates de resposta rápida ainda não são editáveis; Fase 2
  incluirá tabela `support_reply_templates` (opt-in por Super Admin).
- **Auditoria de leitura de anexo**: ainda não registra evento (Fase 2).
- **Notificação por email**: continua pendente (Fase 2 — templates
  transacionais).

## 6. Conclusão

Painel operacional do Super Admin **APROVADO** para uso interno em
homologação. O Super Admin consegue agora visualizar integralmente
título, descrição, anexos, respostas, timeline e informações técnicas
de cada chamado, com tickets separados corretamente por prioridade e
antiguidade.
