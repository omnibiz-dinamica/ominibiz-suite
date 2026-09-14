# Ajuste das 3 recorrências sem ocorrência — Grupo V-clean

Diagnóstico confirmado por consulta direta. Nenhuma das 3 é falha de código — são dados da própria série.

## Situação atual

| Série | Cliente | Frequência | Problema |
|---|---|---|---|
| Crelan (`ef8811ae`) | Banco Crelan | Personalizada | Lista de datas vazia (`selected_dates: []`) — nada a gerar |
| Crelan (`1cde6a76`) | Banco Crelan | Personalizada | Idêntica à anterior, mesmo grupo de tarefas — aparenta ser duplicata |
| EXTRA (`6744149a`) | EXTRA | Semanal, sexta 08:00 | Janela início=fim em 2026-09-05, já encerrada naturalmente |

## Proposta (somente dados, sem código/RLS/RPC)

1. **Crelan (`ef8811ae`)**: definir as datas personalizadas desejadas (a informar pelo usuário) — após isso a geração cria as ocorrências normalmente, sem duplicar nada.
2. **Crelan (`1cde6a76`)**: encerrar como duplicata (`status = ended`, motivo "duplicata da série principal"), evitando geração em dobro quando as datas forem definidas.
3. **EXTRA (`6744149a`)**: encerrar formalmente (`status = ended`, motivo "janela encerrada em 05/09/2026"), pois a vigência já passou.

Alternativa caso o usuário queira manter tudo como está: nenhuma ação — as séries simplesmente continuam sem gerar ocorrências.

## Garantias

- Idempotente: o índice único por série+data impede duplicação ao rodar a geração novamente.
- Nenhuma tarefa, usuário, vínculo ou permissão existente é alterada.
- Somente registros da empresa Grupo V-clean são tocados.

## Validação

- Conferir que as 2 séries encerradas ficam `status = ended` com motivo registrado.
- Rodar `recurrence_materialize(60, company_id)` e confirmar zero duplicatas.
