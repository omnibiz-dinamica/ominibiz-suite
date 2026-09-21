# Férias compartilhadas e anexos mensais de despesas

## Checkpoint 1 — estrutura encontrada

- `notifications` é compartilhada por tarefas, férias, despesas, ponto e suporte. O modelo atual é **uma linha por destinatário** (`user_id` obrigatório), não um evento com vários destinatários.
- O pedido de férias chama `vacation_notify_insert`; hoje ele cria o aviso somente para `assigned_approver_id`. A central de notificações também filtra sempre por `user_id`.
- Os estados atuais (`nova`, `em_tratamento`, `encaminhada`, `resolvida`, `arquivada`) pertencem a cada linha/destinatário. Reutilizá-los para a fila compartilhada alteraria o comportamento dos outros módulos e não garantiria uma tomada única entre gestores.
- Para preservar tudo que existe, a fila compartilhada será **aditiva e exclusiva de férias**, com um registro por pedido, estado, responsável e datas. A tabela `notifications` e seus fluxos atuais não serão reescritos.
- Será necessário somente estender os pontos existentes de criação e decisão de férias para sincronizar essa nova fila, sem mudar as regras de aprovar/rejeitar.

## Checkpoint 2 — estrutura encontrada

- `employee_expenses` guarda um anexo opcional (`attachment_path`, tipo e tamanho) no armazenamento privado `employee-expenses`.
- Caminho atual: `empresa/funcionário/despesa/arquivo`; as regras do armazenamento permitem o próprio funcionário ou gestor da empresa. A tela já abre um anexo individual e exporta a lista para Excel/PDF, mas não imprime os comprovantes nem baixa o mês em lote.
- O relatório atual usa a permissão de Gestor/Proprietário/Super Admin. As novas ações seguirão essa mesma permissão, também validada no servidor.
- Volume real: 23 anexos no sistema, cerca de 44,4 MB; maior empresa tem 16 arquivos/33,3 MB; pior mês tem 7 arquivos/13,6 MB. O maior arquivo tem 4,2 MB. Com esse volume, a geração síncrona em fluxo contínuo é adequada e evita criar filas/jobs desnecessários; serão impostos limites claros para impedir timeout futuro.

## Implementação proposta

### Parte 1 — fila compartilhada de férias

- Criar uma tabela específica com um registro por pedido de férias, `company_id`, estado (`pending`, `in_progress`, `resolved`), `claimed_by`, `claimed_at` e `resolved_at`.
- Aplicar acesso por empresa: gestores veem pendentes da empresa e itens assumidos por si; Super Admin mantém acesso global. Funcionários não acessam essa fila.
- Criar operações protegidas no banco para listar, assumir atomicamente e resolver. A tomada usará atualização condicional; o segundo gestor receberá “Este pedido já foi assumido por outro gestor”.
- Estender a criação de pedido para abrir a fila e a decisão existente para resolvê-la. Nenhuma ação da notificação mudará o status operacional das férias.
- Exibir esses itens na Central de Notificações como uma fonte adicional, mantendo intactas as notificações existentes dos demais módulos.

### Parte 2 — comprovantes de despesas

- Criar um endpoint autenticado que recebe mês/ano, valida o papel e a empresa no servidor, busca apenas despesas daquele mês/empresa e entrega um ZIP.
- Gerar nomes legíveis e únicos: `data_funcionario_descricao.ext`.
- Adicionar seleção de mês e ações “Imprimir comprovantes” e “Baixar comprovantes do mês” no relatório do Gestor.
- A impressão abrirá uma visualização cronológica, do mais antigo para o mais recente, com identificação da despesa e cada imagem/PDF.
- Aplicar limites de quantidade/tamanho e mensagem clara se o volume futuro exigir processamento assíncrono.

## Validação obrigatória

- Férias: testar criação com dois gestores reais da mesma empresa, tomada pelo Gestor A, bloqueio do Gestor B, resolução após aprovação e após rejeição, e isolamento entre empresas.
- Notificações: confirmar que tarefas, tickets, despesas e ponto continuam com o comportamento atual.
- Despesas: testar mais de um funcionário, mês correto, ausência de outro mês/empresa, impressão ordenada, ZIP válido e chamada direta recusada para funcionário.
- Medir o tempo do pacote com o maior mês real e registrar o resultado.
- Executar testes de regressão, verificação de tipos e validar a compilação; atualizar CHANGELOG, DECISIONS e ARCHITECTURE_INDEX.

## Limites

- Nenhum fluxo será publicado sem pedido explícito.
- A implementação exige extensões pequenas nos gatilhos de criação/decisão de férias e nas telas de Notificações/Despesas. Se isso não for aprovado, apenas a remoção do nome duplicado em Tarefas permanecerá.
