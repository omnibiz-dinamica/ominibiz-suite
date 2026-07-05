# OmniBiz — Guia Oficial de Implantação

**Versão:** 1.0
**Data:** 05/07/2026
**Responsável técnico:** Dinâmica Solução
**Público-alvo:** Equipa de implantação OmniBiz
**Status:** Documento oficial — padrão de implantação

---

## Índice

1. Apresentação
2. Checklist Pré-Implantação
3. Criação da Empresa
4. Cadastro dos Gestores
5. Cadastro dos Colaboradores
6. Configuração da Empresa
7. Configuração dos Clientes
8. Teste Operacional
9. Teste da Geolocalização
10. Teste das Férias
11. Teste das Despesas
12. Teste dos Recibos
13. Teste dos Emails
14. Checklist de Entrega
15. Checklist Pós-Implantação
16. Solução de Problemas
17. Boas Práticas
18. FAQ
19. Glossário
20. Anexos

---

## 1. Apresentação

### Objetivo do Guia
Este documento é o padrão oficial da **Dinâmica Solução** para implantação do OmniBiz em novos clientes. Ele reúne, em um único material, todos os passos necessários para colocar o sistema em operação com qualidade, previsibilidade e sem retrabalho.

### Público-Alvo
- Consultores de implantação.
- Suporte técnico da Dinâmica Solução.
- Gestores responsáveis pela ativação de novos clientes.
- Parceiros credenciados.

### Como Utilizar
- Siga os capítulos em ordem, do 1 ao 15.
- Marque cada checkbox ao concluir a etapa.
- Utilize os capítulos 16 a 20 como material de consulta durante e após a implantação.
- Cada cliente novo deve ter uma cópia preenchida deste guia arquivada.

> 💡 **Dica:** este guia complementa o Manual do Funcionário e o Manual do Gestor. Recomenda-se leitura prévia dos três documentos.

---

## 2. Checklist Pré-Implantação

Antes de iniciar qualquer configuração no sistema, valide os itens abaixo com o cliente.

| # | Item | Status |
|---|------|--------|
| 1 | Empresa criada no OmniBiz | ☐ |
| 2 | Plano contratado e confirmado | ☐ |
| 3 | Domínio definido (padrão ou personalizado) | ☐ |
| 4 | E-mail corporativo do gestor validado | ☐ |
| 5 | Gestor responsável nomeado | ☐ |
| 6 | Dados fiscais recebidos (NIF, razão social, morada) | ☐ |
| 7 | Idioma padrão definido (pt-PT / pt-BR / es-ES) | ☐ |
| 8 | Fuso horário confirmado | ☐ |
| 9 | Configuração inicial de RH acordada | ☐ |
| 10 | Backup inicial verificado | ☐ |
| 11 | Ambiente de homologação validado | ☐ |

> ⚠️ **Atenção:** não avance sem os 11 itens confirmados. Implantações iniciadas com dados incompletos geram retrabalho e insatisfação do cliente.

---

## 3. Criação da Empresa

### 3.1 Cadastro
1. Acesse o painel administrativo do OmniBiz com credenciais Super Admin.
2. Menu **Admin → Empresas → Nova Empresa**.
3. Preencha nome, país, idioma, fuso e moeda.

`[INSERIR CAPTURA DA TELA — Formulário de nova empresa]`

### 3.2 Dados Institucionais
- Razão social.
- NIF / CNPJ.
- Morada completa.
- Logotipo (PNG ou SVG).
- Cores institucionais, se aplicável.

`[INSERIR CAPTURA DA TELA — Aba Dados da Empresa]`

### 3.3 Configurações Iniciais
- Plano contratado.
- Limite de usuários.
- Módulos ativos.

`[INSERIR CAPTURA DA TELA — Configurações iniciais]`

### 3.4 Salvar
- Clique em **Salvar** e valide o alerta de sucesso.
- Confirme que a empresa aparece no menu lateral do Super Admin.

> 💡 **Dica:** ao salvar, o OmniBiz gera automaticamente os papéis (Funcionário / Gestor / Super Admin) e políticas de segurança da empresa recém-criada.

---

## 4. Cadastro dos Gestores

### 4.1 Como Convidar
1. Acesse **Equipe → Convidar Colaborador**.
2. Informe nome, e-mail e papel **Gestor**.
3. Clique em **Enviar Convite**.

`[INSERIR CAPTURA DA TELA — Envio do convite]`

### 4.2 Como Aceitar o Convite
- O gestor recebe e-mail com link seguro (validade limitada).
- Ao clicar, é redirecionado para `/aceitar-convite?token=...`.

`[INSERIR CAPTURA DA TELA — E-mail de convite]`

### 4.3 Definir Senha
- Mínimo de 8 caracteres, letras e números.
- Confirmação obrigatória dos termos de uso.

`[INSERIR CAPTURA DA TELA — Tela de senha]`

### 4.4 Acessar o Sistema
- Após concluir o cadastro, o gestor é levado ao painel `/app`.

### 4.5 Validar Permissões
- Menu **Empresa** visível.
- Menu **Ponto → Gestão** visível.
- Menu **RH** visível.
- Não deve existir menu **Admin** (exclusivo Super Admin).

> ⚠️ **Atenção:** conceda o papel Super Admin apenas quando estritamente necessário.

---

## 5. Cadastro dos Colaboradores

### 5.1 Convites
- Fluxo idêntico ao dos gestores, com papel **Funcionário**.
- Convites podem ser enviados em lote.

### 5.2 Perfis
- Foto, dados pessoais, contacto.

### 5.3 Vínculo Empresa / Equipa
- Cada colaborador deve estar vinculado a uma empresa e a uma equipa.

### 5.4 Cargo e Local de Trabalho
- Cargo funcional.
- Local principal de trabalho.

### 5.5 Supervisor
- Indicar o gestor imediato para escalonamento de aprovações.

### 5.6 Documentos
- Contrato assinado.
- Documentos pessoais.
- Termos aceitos.

`[INSERIR CAPTURA DA TELA — Editor de colaborador]`

---

## 6. Configuração da Empresa

### 6.1 RH
- Regime de trabalho.
- Regras de férias.
- Regras de despesas.

### 6.2 Horários
- Jornada padrão.
- Tolerâncias.
- Turnos e escalas.

### 6.3 Folha de Ponto
- Modalidade de captura.
- Regras de correção.
- Auditoria.

### 6.4 Geolocalização
No card **Configurações RH → Geolocalização**:
- **Política:** Bloquear, Alertar ou Justificar.
- **Modo:** GPS obrigatório, opcional ou manual permitido.
- **Raio padrão** aplicado a clientes sem raio próprio.
- **Mensagens personalizadas** ao colaborador.
- **Diagnóstico** (`geo_policy_version`) visível para Super Admin.

`[INSERIR CAPTURA DA TELA — Card Geolocalização]`

### 6.5 Notificações
- Canais: in-app e e-mail.
- Assinaturas por tipo de evento.
- Templates de e-mail com identidade visual do cliente.

> 💡 **Dica:** revise a política de geolocalização sempre que a operação for expandida para uma nova cidade ou modalidade de trabalho.

---

## 7. Configuração dos Clientes

### 7.1 Cadastro do Cliente
1. Menu **Clientes → Novo Cliente**.
2. Informe razão social, contacto e responsável.

`[INSERIR CAPTURA DA TELA — Novo cliente]`

### 7.2 Cadastro do Local
- Endereço completo.
- Complemento e ponto de referência.

### 7.3 Geolocalização
- Buscar automaticamente pelo endereço.
- Ajustar latitude/longitude no mapa.

`[INSERIR CAPTURA DA TELA — ClientGeoEditor com marcador]`

### 7.4 Raio de Tolerância
- Padrão: raio da empresa.
- Personalizado: definir em metros.

### 7.5 Endereço e Observações
- Anotações operacionais úteis (portaria, horário de acesso, etc.).

> ⚠️ **Atenção:** clientes sem coordenadas não permitem geofencing. Os eventos aparecerão marcados como 🟣 na Gestão da Folha de Ponto.

---

## 8. Teste Operacional

Roteiro completo executado com um colaborador real ou de teste.

```text
  Funcionário
      │
      ▼
   Login
      │
      ▼
 Aceitar convite
      │
      ▼
 Iniciar tarefa
      │
      ▼
    Pausa
      │
      ▼
   Retomar
      │
      ▼
   Concluir
      │
      ▼
 Validar gestor
```

### Passos
1. Efetuar login com o colaborador.
2. Aceitar convite se ainda pendente.
3. Acessar **Ponto**, selecionar tarefa e clicar em **Iniciar**.
4. Autorizar GPS.
5. Executar **Pausa** e **Retomar**.
6. Clicar em **Concluir**.
7. No perfil do gestor, abrir **Ponto → Gestão** e validar todos os eventos.

`[INSERIR CAPTURA DA TELA — Overlay do fluxo de ponto]`

---

## 9. Teste da Geolocalização

| Cenário | Ação | Resultado esperado |
|---------|------|--------------------|
| Dentro do raio | Registrar ponto no local do cliente | 🟢 evento aprovado |
| Fora do raio | Registrar ponto a ≥ raio + 50 m | 🔴 evento fora do raio |
| Sem GPS | Negar permissão de localização | ⚫ evento sem GPS |
| Justificativa | Registrar fora do raio + justificar | 🟡 evento justificado |
| Cliente sem GEO | Registrar em cliente sem coordenadas | 🟣 evento sem geofencing |

### Checklist
- [ ] Todos os cenários executados.
- [ ] Todos os eventos visíveis no drawer **Geolocalização**.
- [ ] Diagnóstico `geo_policy_version` corretamente exibido para Super Admin.
- [ ] Timeline em ordem cronológica.
- [ ] Trajeto tracejado renderizado no mapa.

`[INSERIR CAPTURA DA TELA — Drawer de geolocalização]`

---

## 10. Teste das Férias

1. Funcionário acessa **Férias → Nova Solicitação**.
2. Preenche datas e envia.
3. Gestor recebe notificação e aprova.
4. Funcionário recebe confirmação por e-mail e in-app.
5. Validar histórico de aprovação.

`[INSERIR CAPTURA DA TELA — Solicitação de férias]`

---

## 11. Teste das Despesas

1. Funcionário acessa **Despesas → Nova Despesa**.
2. Preenche valor, categoria e data.
3. Anexa comprovante (foto ou PDF).
4. Envia para aprovação.
5. Gestor aprova.
6. Validar histórico e reembolso.

`[INSERIR CAPTURA DA TELA — Nova despesa]`

---

## 12. Teste dos Recibos

1. Gestor acessa **RH → Recibos**.
2. Publica recibo do mês.
3. Funcionário acessa **Meus Recibos** e consulta.
4. Realiza download em PDF.
5. Validar auditoria.

`[INSERIR CAPTURA DA TELA — Publicação de recibo]`

---

## 13. Teste dos Emails

Validar envio e recebimento de:
- Convite de colaborador.
- Reset de senha.
- Aprovação de férias.
- Publicação de recibos.

Checklist:
- [ ] E-mails chegam à caixa principal (não spam).
- [ ] Identidade visual correta.
- [ ] Links funcionam.
- [ ] Idioma correto.

---

## 14. Checklist de Entrega

| # | Item | Status |
|---|------|--------|
| 1 | Gestor treinado | ☐ |
| 2 | Funcionários treinados | ☐ |
| 3 | E-mails funcionando | ☐ |
| 4 | Geolocalização testada | ☐ |
| 5 | Convites testados | ☐ |
| 6 | RH validado | ☐ |
| 7 | Férias validadas | ☐ |
| 8 | Despesas validadas | ☐ |
| 9 | Recibos validados | ☐ |
| 10 | Dashboard validado | ☐ |
| 11 | Backup realizado | ☐ |
| 12 | Cliente aprovou formalmente | ☐ |

---

## 15. Checklist Pós-Implantação

### Após 24 horas
- [ ] Confirmar login diário do gestor.
- [ ] Verificar registros de ponto do primeiro dia.
- [ ] Revisar alertas de geolocalização.

### Após 7 dias
- [ ] Validar consistência da folha de ponto.
- [ ] Revisar despesas e férias abertas.
- [ ] Reunião de acompanhamento com gestor.

### Após 30 dias
- [ ] Fechar primeiro ciclo de recibos.
- [ ] Auditar registros fora do raio.
- [ ] Coletar feedback estruturado.
- [ ] Registrar melhorias na base de conhecimento.

---

## 16. Solução de Problemas

| Problema | Possível causa | Solução |
|----------|----------------|---------|
| Não recebe e-mail | Caixa de spam ou domínio bloqueado | Verificar spam, validar SPF/DKIM |
| GPS negado | Permissão bloqueada no navegador | Reautorizar em Configurações do navegador |
| Convite expirado | Prazo de validade ultrapassado | Reenviar convite pelo gestor |
| Mapa não abre | Provedor indisponível | Fallback automático; validar conexão |
| Não consegue bater ponto | Sem tarefa selecionada | Selecionar tarefa antes de iniciar |
| Não consegue acessar | Senha incorreta | Utilizar recuperação de senha |
| Erro de permissão | Papel incorreto no RBAC | Rever atribuição em **Equipe** |
| Erro de geolocalização | Cliente sem coordenadas | Cadastrar lat/lon no cliente |

---

## 17. Boas Práticas

### Como Implantar
- Siga o guia na ordem.
- Não pule etapas de teste.
- Documente qualquer decisão fora do padrão.

### Como Treinar
- Treine gestor primeiro, funcionários depois.
- Utilize os manuais oficiais.
- Realize sessão prática ao vivo.

### Como Evitar Erros
- Nunca compartilhe senhas.
- Nunca conceda Super Admin sem necessidade.
- Sempre valide coordenadas dos clientes.

### Como Organizar Clientes
- Padronize nomenclatura.
- Utilize raios coerentes com o tipo de operação.
- Mantenha endereços atualizados.

---

## 18. FAQ

**Posso iniciar a implantação sem o gestor definido?**
Não. O gestor é o ponto único de aprovação do cliente.

**O sistema funciona offline?**
A captura de GPS exige conexão. Fluxos administrativos podem ser retomados assim que a conexão volta.

**Posso configurar múltiplas empresas para o mesmo cliente?**
Sim, o Super Admin gerencia múltiplas empresas.

**Como alterar a política de geolocalização depois?**
Menu **Empresa → Configurações RH → Geolocalização**. Alterações passam a valer nos próximos registros.

**Onde consulto o histórico de auditoria?**
Em **Ponto → Gestão**, no drawer de cada registro.

---

## 19. Glossário

- **RBAC:** controle de acesso baseado em papéis.
- **RLS:** política de segurança em nível de linha no banco.
- **RPC:** função executada diretamente no banco.
- **Geofencing:** cerca virtual com raio de tolerância.
- **Append-only:** dados imutáveis após inserção.
- **Fingerprint:** identificação técnica do dispositivo.
- **Timeline:** linha do tempo cronológica dos eventos.
- **SLO:** meta de nível de serviço.
- **MapProvider:** camada abstrata que unifica Google, Mapbox e OSM.
- **Super Admin:** perfil máximo, gerencia toda a plataforma.

---

## 20. Anexos

### 20.1 Checklist Completo
Consolidação dos checklists dos capítulos 2, 14 e 15 para impressão avulsa.

### 20.2 Fluxogramas
- Fluxo de convite → aceitação → login.
- Fluxo de ponto (arrival → start → pause → resume → stop → departure).
- Fluxo de férias (solicitação → aprovação → notificação).

### 20.3 Referências
- `docs/RELEASE_NOTES_GEOFENCING_v1.0.md`
- `docs/RELEASE_HISTORY.md`
- `docs/manuals/Manual_Operacional_Funcionario.md`
- `docs/manuals/Manual_Operacional_Gestor.md`
- `docs/ARCHITECTURE_INDEX.md`

---

*Documento oficial OmniBiz — Guia de Implantação v1.0 — 05/07/2026.*
*Padrão oficial da Dinâmica Solução para todos os clientes futuros.*