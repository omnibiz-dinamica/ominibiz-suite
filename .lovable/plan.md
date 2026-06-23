## Objetivo

Entregar um documento executivo, em PT-PT, para apresentar à direção da empresa o que o sistema faz, como faz e em que estado está. Formato final: **PDF** (~10–15 páginas), gerado a partir de um DOCX, com capa, índice e identidade visual do produto.

## Estrutura do documento

1. **Capa** — nome do produto, subtítulo "Visão executiva da plataforma", data, versão e destinatário (Direção).
2. **Sumário executivo** (1 pág.) — o que é o sistema, problemas que resolve, ganhos operacionais esperados.
3. **Arquitetura em alto nível** (1 pág.) — diagrama simples: utilizadores → aplicação web → backend (base de dados, autenticação, ficheiros, envio de email, jobs agendados). Sem jargão técnico.
4. **Perfis de utilizador e segurança de acesso** (1 pág.) — Owner, Manager, Employee, Super Admin: o que cada um pode ver e fazer. Princípio: cada pessoa só acede ao que lhe pertence.
5. **Módulos funcionais** (1 página por módulo, com: para que serve, fluxo principal, quem usa, status):
   - Equipa / Colaboradores (cadastro, contabilidade, contratos, renovações)
   - Férias (pedido, aprovação, criação pelo gestor, alteração, notificações, emails)
   - Tarefas (criação, edição, cancelamento, arquivamento, recorrência)
   - Recibos (upload, publicação, consulta pelo colaborador, envio por email com histórico)
   - Despesas (submissão com anexo, aprovação/rejeição, histórico)
   - Documentos do colaborador (upload, alertas de vencimento)
   - Contratos comerciais (templates, workflow, auditoria)
   - Viaturas e cartões de combustível (atribuição, registos)
   - Tempo / Time entries (registo e valoração)
   - Clientes e responsáveis
   - Convites e onboarding
   - Notificações e comunicação por email (templates, fila de envio, logs)
   - Dashboard RH (consolidação: vencimentos, renovações, ações pendentes)
6. **Como o sistema comunica** (1 pág.) — notificações in-app, emails transacionais via domínio próprio, jobs diários (ex.: alertas de documentos a expirar).
7. **Segurança, privacidade e auditoria** (1 pág., linguagem de negócio) — autenticação, controlo de acesso por empresa, registo de auditoria em ações sensíveis, separação de papéis para evitar elevação de privilégios.
8. **Estado atual / prontidão para produção** (1 pág.) — quadro com status por módulo: Implementado, Parcial, Pós-lançamento. Inclui resultado da auditoria final aprovada.
9. **Itens diferidos para pós-lançamento** (½ pág.) — expiração automática de convites, ajustes de fuso horário em defaults, melhorias planeadas.
10. **Roadmap curto prazo** (½ pág.) — reembolsos automáticos de despesas, integração contabilística, centros de custo, relatórios financeiros avançados.
11. **Glossário** (½ pág.) — termos-chave em linguagem de negócio.

## Identidade visual

- Cores e tipografia lidas dos tokens atuais do projeto (a confirmar nos ficheiros de tema antes de gerar). Cor primária do produto na capa, títulos e barras de status; cinzas neutros para o corpo.
- Tipografia: Arial para máxima portabilidade no DOCX/PDF; tamanhos: título 32pt, H1 24pt, H2 18pt, corpo 11pt.
- Capa com bloco de cor primária, nome do produto e marca de água discreta.
- Cabeçalho e rodapé em todas as páginas (nome do produto à esquerda, paginação à direita).
- Tabelas com cabeçalho preenchido na cor primária e linhas alternadas em cinza muito claro.
- Sem ícones decorativos pesados; chips de status (Implementado / Parcial / Pós-lançamento) em verde / âmbar / cinza.

## Detalhes técnicos da geração

- Gerar `relatorio-executivo.docx` com `docx-js` (skill DOCX), seguindo:
  - Página A4, margens 2,5 cm.
  - Estilos `Heading1`/`Heading2` sobrescritos com `outlineLevel` para gerar TOC.
  - Tabelas em DXA com `columnWidths` somando à largura útil; padding interno nas células.
  - Listas via `numbering.config` (sem bullets unicode).
  - Sem quebras manuais com `\n`; usar `Paragraph` por linha.
- Converter para PDF com LibreOffice headless e renderizar cada página em JPG (150 dpi) para QA visual: verificar transbordos, contraste, tabelas alinhadas, ausência de placeholders.
- Entregar ambos os ficheiros em `/mnt/documents/`:
  - `relatorio-executivo.pdf` (entrega principal)
  - `relatorio-executivo.docx` (fonte editável, caso a direção peça ajustes)
- Apresentar via `<presentation-artifact>` o PDF.

## Confirmações antes de implementar

Nenhuma — todas as decisões necessárias já foram respondidas (formato PDF a partir de DOCX, profundidade executiva, PT-PT com identidade do sistema, escopo completo incluindo auditoria e roadmap). Avanço diretamente para a geração assim que o plano for aprovado.
