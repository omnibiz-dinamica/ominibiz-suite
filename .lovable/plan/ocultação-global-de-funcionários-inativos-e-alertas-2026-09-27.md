# Ocultação global de funcionários inativos e alertas

## Objetivo
- Tratar a situação ativa/inativa como atributo global da pessoa, independentemente da empresa em que aparece.
- Ocultar inativos de todas as listas de nova seleção e pesquisa, preservando nomes apenas em registos históricos já existentes.
- Resolver somente alertas atuais comprovados, sem alterar fluxos operacionais não relacionados.

## Implementação
1. Centralizar no banco a regra de “funcionário ativo”, considerando `is_active`, o estado cadastral e a data de saída.
2. Fazer todas as listas de nova atribuição consultarem essa regra no servidor, em vez de repetirem filtros diferentes por tela ou empresa.
3. Manter a Lista Inativa da área de Usuários como o único local administrativo onde inativos aparecem deliberadamente, com o selo visível.
4. Preservar o nome de um inativo em tarefas, recorrências e outros históricos já criados, sem oferecê-lo como nova escolha.
5. Verificar as listas de Tarefas, Recorrências, Reatribuir, Equipa do cliente e Ponto em empresas diferentes.
6. Executar os testes de regressão e conferir o scan de segurança; não mexer em alertas antigos ou não relacionados sem evidência.

## Validação
- Pessoa inativa ligada a uma ou várias empresas não aparece em novas seleções em nenhuma delas.
- Pesquisa não encontra inativos fora da Lista Inativa.
- Registos históricos continuam identificados corretamente.
- Tema e demais fluxos permanecem inalterados.
- Compilação, testes relevantes e alertas atuais sem erros.
