# Recorrências sem fim: horizonte de 12 meses + apuração do erro do Dashboard

## Checkpoint 0 — estado real do código hoje (verificado agora, com evidência)

| Item | Situação | Evidência |
|---|---|---|
| a) Gera por série individual | **Já corrigido** | `recurrence_materialize(_days_ahead, _company_id, _recurrence_id)` filtra `id = _recurrence_id`; o salvamento chama a função uma vez por série criada |
| b) Erro real na tela | **Já corrigido** | ao falhar, mostra "Recorrência salva, mas as ocorrências não foram geradas (...)" — não há mais aviso otimista |
| c) start_date vem do formulário | **Já corrigido** | a série grava a data digitada no bloco de recorrência, não a data da tarefa-modelo |
| d) Validação de data final | **Já corrigido** | bloqueio no formulário e exceção na função de edição da série |
| e) Horizonte para séries sem fim | **NÃO existe a regra pedida** | a geração só olha 60 dias à frente e **nada estende esse horizonte depois**; não há janela de 12 meses nem processo periódico por série |

Conclusão do Checkpoint 0, conforme sua própria regra: existe item pendente (e), então paro aqui e trato isso primeiro.

Dois fatos adicionais levantados no mesmo passo, sem varredura genérica:

- Séries ativas com data de início vencida e **zero** ocorrências em todo o sistema: **apenas 1** — "Crelan" (Grupo V-clean, criada em 24/08/2026, tipo personalizada com a lista de datas vazia). É um resíduo anterior à validação atual, que hoje já impede salvar uma personalizada sem datas. Nenhuma outra empresa/cliente tem série órfã.
- Nenhum registro de falha de geração na auditoria (`materialize_error` = 0 linhas).
- Volume atual: Grupo V-clean 8.863 tarefas, 79 séries ativas, **43 sem data final**; OMNIBIZ TESTES 495/7/0; V-clean TESTE 119/4/0.

## Respostas às 4 confirmações pedidas (consultas já executadas, sem alterar nada)

**1. Tamanho real do problema.** Das 43 séries sem data final (todas na Grupo V-clean): 40 têm ocorrências futuras, 3 não têm nenhuma ocorrência e **0 estão "paradas no passado"**. A ocorrência futura mais próxima do fim é 03/11/2026 e o horizonte máximo hoje alcança 13/10/2027. Das 3 sem ocorrência: "Crelan" (personalizada com lista de datas vazia, resíduo antigo), "Escadas - LUTSELUSPLEIN 16" (início 05/01/2027, ainda fora da janela) e "Espera" (início 07/10/2026, fora da janela). Ou seja: hoje ninguém perdeu ocorrências passadas; o risco é o horizonte encolher com o tempo, que é exatamente o que a Etapa 2 resolve.

**4. Resíduo de data final anterior à inicial.** Existem 47 séries nessa condição: 30 com situação "encerrada" e 17 "pausada" — **nenhuma ativa**. Isso é o efeito normal do fluxo de encerrar série cancelando as futuras, que grava a data final no dia anterior ao início como marca de encerramento. Nenhuma série ativa está bloqueada por isso, e nada será alterado.

**2 e 3** (catch-up nunca gerar datas passadas, e geração em lote com tempo medido no pior caso) serão confirmados por escrito com teste e medição durante a implementação, antes de qualquer declaração de conclusão.

Portanto o sintoma 1 tem explicação concreta e mensurável: as séries sem fim só têm ocorrências até 60 dias e ninguém estende. Para o usuário, isso aparece como "montei a recorrência e nada foi criado" sempre que a próxima data cai fora dessa janela.

## Sobre o erro do Dashboard (sintoma 2)

Não afirmo causa. A consulta que o Dashboard faz na empresa de produção foi medida agora diretamente no banco: **10 ms**, usando índice, 16 linhas — não é timeout nem consulta sem escopo. Ou seja, a hipótese "mesmo padrão da recorrência" **não se sustenta** com a evidência atual. O erro precisa ser capturado ao vivo (mensagem na tela, console, requisição que falhou) antes de qualquer alteração.

## O que será feito

### Etapa 1 — Horizonte rolante de 12 meses (séries sem data final)
- A geração de ocorrências passa a respeitar um teto de **12 meses a partir de hoje** (ou do início da série, se for mais recente) quando a série não tem data final.
- O campo "data final" das séries **não é alterado em nenhum registro**: a série continua "sem fim" para o usuário. O limite existe só no momento de pré-gerar as tarefas.
- Séries com data final continuam limitadas pela própria data final.
- Ao salvar uma recorrência nova, a geração inicial usa esse horizonte, série por série.

### Etapa 2 — Extensão periódica do horizonte, série por série
- Rotina diária que percorre as séries ativas **uma a uma** (nunca a empresa inteira numa tacada) e completa o que falta até 12 meses à frente.
- Cada série é isolada: falha de uma não interrompe as outras e fica registrada na auditoria já existente.
- Sem duplicação: continua valendo o índice único (série + data), que **não será alterado**, nem `canonical_key`, nem políticas de acesso.

### Etapa 3 — Encerrar o resíduo "Crelan"
- Reportar a linha exata e só encerrar a série depois da sua confirmação. Nenhum backfill retroativo sem lista aprovada.

### Etapa 4 — Dashboard: capturar a falha real antes de corrigir
- Abrir o Dashboard como usuário real da empresa de produção, registrar a mensagem exata, o erro do console e a requisição que falhou.
- Só então propor a correção, com a causa comprovada. Se a captura mostrar que é permissão/leitura de dados e não volume, a correção muda de natureza.

### Etapa 5 — Verificação
- Testes automatizados novos para o horizonte de 12 meses (série sem fim, série com fim, série personalizada) e para a extensão periódica.
- Verificação de tipos, build e a suíte completa.
- Conferência no banco em empresa de alto volume: contagem de ocorrências antes/depois, zero duplicatas, e confirmação explícita de que nenhuma série teve a data final alterada.
- Atualização de CHANGELOG, DECISIONS e ARCHITECTURE_INDEX.

## Detalhes técnicos

- `public.recurrence_materialize`: teto de geração passa a `LEAST(COALESCE(end_date, current_date + '12 months'), current_date + _days_ahead)` quando `_days_ahead` for informado, e quando a chamada pedir horizonte completo usa 12 meses; nenhuma escrita em `task_recurrences`.
- Nova função `public.recurrence_extend_horizon(_limit int)` que seleciona séries ativas com menor cobertura futura e chama a materialização por `recurrence_id`, com `EXCEPTION` por série gravando em `task_dedupe_audit`.
- Agendamento diário via `pg_cron` (uma execução por dia, ~1x/dia): é necessário porque o horizonte é rolante; o atraso máximo para uma nova ocorrência distante aparecer é de 1 dia, e a execução diária tem custo desprezível por ser única e limitada por lote.
- `src/routes/app.tarefas.tsx` e `src/lib/tasks.ts`: horizonte da chamada de criação passa a 365 dias para séries sem fim, mantendo a chamada por série e o erro real na tela.
- Preservados sem alteração: `uq_tasks_recurrence_date`, `canonical_key`, RLS.
