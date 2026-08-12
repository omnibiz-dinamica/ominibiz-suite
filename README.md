# OmniBiz Suite

Criar um sistema SaaS modular chamado "OmniBiz", focado inicialmente em empresas de limpeza, mas com arquitetura preparada para expansão futura para restaurantes, delivery, pizzarias e serviços operacionais.

IMPORTANTE:
O sistema deve ser construído com arquitetura escalável, organizada e preparada para produção real.

OBJETIVO PRINCIPAL:

Centralizar operações da empresa:

planejamento de tarefas

controle de funcionários

folha de ponto

notificações

controle operacional

geração futura de faturamento

O foco é reduzir falhas humanas através de automação controlada e regras inteligentes.

ARQUITETURA OBRIGATÓRIA:

sistema multiempresa

arquitetura modular

separação clara entre:

interface

regras de negócio

dados

TECNOLOGIAS:

Frontend moderno e responsivo

Backend estruturado

Banco de dados relacional

Preparado para tempo real

Estrutura pronta para mobile futuro

REGRAS PRINCIPAIS:

Toda lógica de negócio deve ficar centralizada.
A interface nunca deve decidir regras importantes.

Evitar:

loops contínuos

automações pesadas

polling desnecessário

Priorizar:

lógica baseada em evento

atualização inteligente

consistência operacional

MÓDULOS INICIAIS:

Planejamento de Trabalho

Folha de Ponto

Notificações

Controle de Usuários

Controle de Empresas

Assistente IA (estrutura básica)

Controle de Notas (MVP)

HIERARQUIA:

SUPER ADMIN

acesso total ao sistema

GESTOR

controla apenas sua empresa e filiais

FUNCIONÁRIO

acesso apenas às próprias tarefas e pontos

FLUXO PRINCIPAL:

gestor cria tarefa

funcionário inicia tarefa via folha de ponto

status:

pendente

em_andamento

concluido

cancelado

ausente

autorizado

REGRAS IMPORTANTES:

tarefas atrasadas NÃO devem usar loop contínuo

ausência deve ser processada por evento

notificações devem permitir ação direta

gestor pode aprovar ou rejeitar exceções

funcionário deve justificar atrasos

SISTEMA DE NOTIFICAÇÕES:

As notificações devem:

atualizar em tempo real

possuir deep link

permitir marcar como lida

permitir ações operacionais

TEMPO REAL:

Usar atualização em tempo real apenas para:

atualizar interface

sincronizar dados visuais

NUNCA usar realtime para:

executar lógica pesada

alterar status automaticamente

criar loops

INTERFACE:

moderna

limpa

operacional

rápida

cores bem contrastadas

sem textos com baixa visibilidade

preparada para uso diário intenso

IMPORTANTE:

O sistema deve ser construído pensando em:

escalabilidade SaaS

múltiplos países

expansão futura

controle operacional real

automações inteligentes

EXPANSÃO FUTURA (PREPARAR ESTRUTURA):

faturamento automático

integração WhatsApp

chatbot operacional

delivery

restaurantes

pagamentos

controle de frota

férias

clientes

projetos

PRIORIDADE ATUAL:

Criar estrutura sólida, modular e escalável antes de adicionar funcionalidades complexas.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ominibiz-suite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d42a3fc9-8799-449c-b1c4-1f047d7204cd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
