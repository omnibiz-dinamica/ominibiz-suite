# Recorrência da Paula Renata (V-clean) e saúde geral da recorrência

## O que já foi confirmado por consulta

- A série criada hoje às 12:55 existe: "Espera", funcionária **Paula Renata**, cliente válido, semanal (quarta e sexta), 08:30, **início 07/10/2026** e fim 07/10/2027, status ativa.
- Ela **não gerou nenhuma ocorrência**. Mais: **nenhuma tarefa foi criada em toda a empresa** depois das 12:50 de hoje, embora a série esteja dentro da janela de geração de 60 dias.
- Não há causa de dados nesta série: cliente existe, funcionária existe e tem vínculo ativo (`employee`) na V-clean, nenhuma série ativa da empresa aponta para cliente ou pessoa inexistente.
- Dois pontos de atenção separados:
  1. **Data divergente:** você pediu a partir de **07/09/2026**, mas a série ficou com início **07/10/2026** — um mês à frente. Precisa de reprodução na tela para confirmar a origem (a data de início da recorrência é travada à data da tarefa e há sugestão automática pelo horário do cliente).
  2. **A geração é tudo-ou-nada:** a rotina percorre todas as séries da empresa num único bloco, sem tratamento de erro por série. Uma única linha problemática cancela a geração da empresa inteira, e a tela só mostra "as próximas ocorrências serão geradas automaticamente" — foi exatamente isso que aconteceu na semana passada com as séries "dvfs".

## Plano

### 1. Capturar o erro real da geração (diagnóstico decisivo)
Executar a geração para a V-clean capturando a resposta completa do banco (código, mensagem, detalhe e orientação), em vez do aviso genérico da tela. Isso diz se é tempo de execução esgotado, violação de regra ou outra exceção.

### 2. Gerar as ocorrências da Paula Renata
Com a causa conhecida, rodar a geração e confirmar as ocorrências da série dela nas quartas e sextas, sem duplicar nada já existente (o índice único por série+data garante isso).

### 3. Corrigir a fragilidade estrutural da recorrência (todo o sistema)
- Isolar falhas **por série**: um erro numa série passa a ser registrado e ignorado, e as demais continuam gerando. Fim do efeito "uma série ruim derruba a empresa toda".
- Registrar cada falha de série numa auditoria consultável, com motivo legível.
- Mostrar na tela de Recorrências quais séries falharam e por quê, em vez de um aviso genérico.
- Adicionar vínculo formal entre série e cliente, para que apagar um cliente não deixe séries apontando para registro inexistente.

### 4. Esclarecer a data de início
Reproduzir a criação na tela com data 07/09/2026 e a mesma frequência para identificar se a data é deslocada pela sugestão automática de horário do cliente ou pelo travamento do campo. Corrigir só depois de reproduzir, sem mexer no resto do formulário.

### 5. Ajustar a série já criada
Depois de esclarecido o item 4: corrigir o início da série da Paula Renata para a data que você quer (07/09/2026, se confirmado) e gerar as ocorrências.

## Detalhes técnicos

- `recurrence_materialize(_days_ahead, _company_id)` é `SECURITY DEFINER`, percorre `task_recurrences` ativas num `FOR` externo e insere em `tasks` com `ON CONFLICT (recurrence_id, recurrence_date) DO NOTHING`. Não há `BEGIN/EXCEPTION` por iteração — daí o tudo-ou-nada.
- A correção mantém a mesma função (sem `_v2`), adicionando bloco de exceção por série e registro em auditoria existente de recorrência.
- `task_recurrences.client_id` não tem chave estrangeira; será adicionada com `ON DELETE SET NULL`, coerente com `tasks.client_id`.
- Nenhuma alteração em RLS, RBAC, memberships ou dados de produção fora das séries citadas.

## Validação

- Geração roda sem erro e retorna as ocorrências esperadas para a série da Paula Renata.
- Segunda execução seguida cria zero duplicatas.
- Nenhuma outra empresa/série perde ocorrências (contagem antes/depois).
- Typecheck, build e a suíte de testes existente.
