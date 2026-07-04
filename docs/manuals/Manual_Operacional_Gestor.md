# OmniBiz — Manual Operacional do Gestor

**Versão:** 1.0
**Data:** 04/07/2026
**Público:** Gestores, RH e Super Admin.
**Status:** Documento oficial.

---

## 1. Apresentação

Este manual descreve como o gestor opera o OmniBiz no dia a dia: convites, permissões, configuração da empresa, folha de ponto, férias, despesas, recibos, RH e dashboards. O objetivo é fornecer um guia único para toda a operação gerencial.

> 💡 **Dica:** este manual complementa o Manual do Funcionário. Recomenda-se leitura de ambos.

---

## 2. Gestão de Colaboradores

### 2.1 Convites
1. Acesse **Equipe**.
2. Clique em **Convidar Colaborador**.
3. Informe nome, e-mail e papel.
4. Envie. O colaborador receberá o link por e-mail.

### 2.2 Permissões
Os papéis disponíveis são:
- **Funcionário:** operação básica.
- **Gestor:** administra sua empresa.
- **Super Admin:** administra a plataforma.

> ⚠️ **Atenção:** nunca conceda Super Admin sem necessidade real.

### 2.3 Cadastro
No cadastro do colaborador, informe:
- Dados pessoais
- Dados profissionais
- Contrato
- Documentos

---

## 3. Configuração da Empresa

Acesse **Empresa** para ajustar dados institucionais, logotipo, endereço e configurações de RH.

### 3.1 Geolocalização
No card **Configurações RH → Geolocalização**:
- **Política:** Bloquear, Alertar ou Justificar.
- **Modo:** GPS obrigatório, opcional ou manual permitido.
- **Raio padrão:** aplicado a clientes sem raio próprio.
- **Mensagens:** personalize os textos exibidos ao colaborador.
- **Diagnóstico:** Super Admin visualiza `geo_policy_version`.

> 💡 **Dica:** revise a política ao expandir a operação para novas cidades.

---

## 4. Clientes

### 4.1 Configuração dos Locais
No cadastro do cliente informe:
- Endereço
- Latitude/Longitude
- Raio de tolerância
- Observações operacionais

O sistema exibe o mapa com marcador e círculo de tolerância.

> ⚠️ **Atenção:** clientes sem coordenadas não permitem geofencing. Os registros aparecerão como 🟣.

---

## 5. Folha de Ponto

### 5.1 Gestão
Acesse **Ponto → Gestão** para visualizar registros de todos os colaboradores.

### 5.2 Correções
- Edite horários via **Editar Ponto**.
- Toda alteração é auditada.

### 5.3 Auditoria
- A tabela `time_entry_geopoints` é append-only.
- Toda modificação de metadados fica registrada.

### 5.4 Mapa
- Abra o drawer **Geolocalização** de um registro.
- Visualize marcadores numerados por evento.
- Consulte trajeto tracejado entre pontos.

### 5.5 Timeline
- Ordem cronológica: Arrival → Start → Pause → Resume → Stop → Departure.
- Cada evento mostra hora, distância, precisão e justificativa.

---

## 6. Férias

### 6.1 Aprovação
- Acesse **Férias**.
- Analise o pedido, saldo e conflitos.
- Clique em **Aprovar**.

### 6.2 Rejeição
- Informe motivo obrigatório.
- O colaborador é notificado automaticamente.

---

## 7. Despesas

### 7.1 Aprovação
- Consulte a lista de despesas pendentes.
- Verifique comprovante anexado.
- Aprove, rejeite ou solicite ajustes.

---

## 8. Recibos

### 8.1 Publicação
1. Acesse **RH → Recibos**.
2. Faça upload do arquivo.
3. Vincule ao colaborador e mês de referência.
4. Publique. O colaborador receberá notificação.

---

## 9. RH

### 9.1 Documentos
- Contratos assinados
- Documentos pessoais
- Termos aceitos

### 9.2 Contratos
- Geração via modelo.
- Assinatura eletrônica.
- Auditoria completa.

### 9.3 Renovações
- Alerta automático antes do vencimento.
- Fluxo simplificado de renovação.

---

## 10. Dashboard

### 10.1 Indicadores
- Horas trabalhadas.
- Registros fora do raio.
- Férias em andamento.
- Despesas pendentes.
- Contratos a vencer.

---

## 11. Notificações

- Configure canais (in-app e e-mail).
- Gerencie assinaturas por tipo de evento.
- Consulte histórico no ícone de sino.

---

## 12. Fluxo Operacional Diário

1. Revisar registros do dia anterior.
2. Aprovar despesas e férias pendentes.
3. Analisar alertas de geolocalização.
4. Publicar recibos, se aplicável.
5. Monitorar dashboard de indicadores.

---

## 13. Checklists

### 13.1 Checklist Diário
- [ ] Revisar folha de ponto.
- [ ] Aprovar despesas.
- [ ] Analisar alertas.
- [ ] Responder notificações.

### 13.2 Checklist Semanal
- [ ] Revisar férias solicitadas.
- [ ] Conferir contratos a vencer.
- [ ] Auditar registros fora do raio.
- [ ] Reunião com equipe.

### 13.3 Checklist Mensal
- [ ] Publicar recibos.
- [ ] Fechar folha de ponto.
- [ ] Revisar indicadores do dashboard.
- [ ] Atualizar configurações da empresa se necessário.

---

## 14. Boas Práticas

- Mantenha coordenadas dos clientes sempre atualizadas.
- Revise a política de geolocalização periodicamente.
- Documente toda correção manual de ponto.
- Utilize o dashboard como fonte oficial de indicadores.
- Evite conceder permissões excessivas.

---

## 15. Perguntas Frequentes

**Como corrigir um ponto de um colaborador?**
Use **Ponto → Gestão → Editar** e informe o motivo. A alteração fica auditada.

**Um colaborador registrou fora do raio, e agora?**
Verifique justificativa e localização no drawer de Geolocalização.

**Posso ter mais de um Super Admin?**
Sim, mas recomenda-se limitar ao mínimo necessário.

**O mapa não carrega, o que fazer?**
O sistema exibe fallback automático. Verifique conexão e provedor de mapas configurado.

---

## 16. Glossário

- **RBAC:** controle de acesso baseado em papéis.
- **RLS:** política de segurança em nível de linha.
- **Geofencing:** cerca virtual com raio de tolerância.
- **RPC v2:** contrato padronizado das funções de banco.
- **Append-only:** dados imutáveis após inserção.
- **Fingerprint:** identificação técnica do dispositivo.
- **SLO:** meta de nível de serviço.

---

## 17. Espaço para Módulos Futuros

Módulos futuros (Comercial, Frota, Mercado, Loja de Roupas, Restaurantes, IA, Financeiro) serão incorporados como capítulos adicionais deste manual, mantendo a estrutura atual sem necessidade de reescrita.

---

*Documento oficial OmniBiz — v1.0 — 04/07/2026.*