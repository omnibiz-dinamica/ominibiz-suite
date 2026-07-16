# Release Notes — Gestor — OmniBiz V1.0

> **Público:** Gestor / Owner · **Data:** 2026-07-16

## O que muda para o Gestor

### 1. Modo de apontamento por cliente
Cada cliente agora tem uma escolha: **Start/Stop** (batida em tempo real) ou **Manual** (registro posterior). Configure em `/app/clientes`.

### 2. Forma de cobrança com quatro modelos
Hora · Fixo · **Mensal** (novo) · Misto. Campos revelam-se conforme a escolha.

### 3. Valores padrão da empresa
Em `/app/empresa`, defina uma tabela padrão (hora, fixo, mensal). Clientes e funcionários sem valor próprio herdam esses valores. Reduz preenchimento repetitivo.

### 4. Overrides por funcionário
Aba **Financeiro** no editor de funcionário permite sobrescrever a tabela padrão para casos individuais.

### 5. Recorrência mais simples para clientes manuais
Se o cliente estiver em modo **Manual**, o formulário de recorrência pede apenas datas — horário e duração ficam ocultos.

### 6. Dashboard clicável
Os quatro cards do dashboard (Pendentes / Em andamento / Concluídas / Atrasadas) agora levam direto para `/app/tarefas` já filtrada.

### 7. Filtros em URL
A tela de Tarefas expõe barra de chips por status + `EmployeePicker` por funcionário. A URL guarda o filtro — pode compartilhar por link.

### 8. Filtro de funcionário padronizado
Tarefas, Despesas, Férias e Ponto/Gestão agora usam o mesmo componente de busca por funcionário (nome, cargo, equipe ou e-mail).

---

## Como aproveitar

1. Comece em `/app/empresa` definindo os **valores padrão**.
2. Revisite clientes existentes em `/app/clientes` e escolha o **modo de apontamento** correto.
3. Nos contratos mensais, escolha **Forma de cobrança = Mensal**.
4. Em `/app/equipe`, ajuste apenas os funcionários que precisam sair da tabela padrão.
5. Use o dashboard como ponto de partida da rotina diária.

## Perguntas frequentes

- *E se eu deixar um valor em branco?* O sistema herda automaticamente (funcionário → cliente → empresa).
- *O histórico de tarefas antigas mudou?* Não. Alterações são aditivas.
- *Posso desfazer o modo Manual?* Sim, a qualquer momento no editor do cliente.