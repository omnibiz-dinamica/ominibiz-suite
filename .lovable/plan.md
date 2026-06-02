## Diagnóstico

- A infra de email (fila, templates auth, server routes, cron) **já está pronta no código**.
- O bloqueio é **apenas DNS**: `notify.dinamicasolucao.com` está em `awaiting_dns`.
- Sem a verificação DNS, nenhum email sai — auth, recibos, nada.
- O domínio está na **Hostnet**, que aceita registros NS em subdomínio (compatível com a delegação da Lovable).

## Plano para destravar

### 1. Reabrir o setup do domínio para obter os NS exatos

Vou te mostrar o botão de setup de email. Ao abrir:
- Confirme o subdomínio `notify`
- O painel exibirá **2 registros NS** (algo como `ns3.lovable.cloud` e `ns4.lovable.cloud`)
- **Copie os 2 valores** — você vai colar na Hostnet

### 2. Adicionar os NS na Hostnet

Passo a passo no painel da Hostnet:

```text
1. Login em https://painel.hostnet.com.br
2. Menu "Domínios" → selecione dinamicasolucao.com
3. Clique em "DNS" (ou "Editor de Zona DNS")
4. Adicionar Registro:
   - Tipo: NS
   - Nome/Host: notify
   - Valor: ns3.lovable.cloud
   - TTL: 3600 (ou padrão)
5. Repetir para o segundo NS (ns4.lovable.cloud)
6. Salvar
```

⚠️ **Importante na Hostnet**:
- Use **NS** (não A, não CNAME)
- O nome é só `notify` (a Hostnet completa com `.dinamicasolucao.com`)
- **Remova qualquer A/CNAME existente para `notify`** — eles conflitam com os NS
- Não mexa nos NS do domínio raiz `dinamicasolucao.com`

### 3. Verificar

- Aguarde 10–30 min (propagação típica na Hostnet) — pode levar até 72h em casos extremos
- Volte em **Cloud → Emails → Manage Domains** e clique em **Verify Domain**
- Quando o status virar `active`, os emails começam a sair automaticamente (auth, recibos, fila)

### 4. Validação pós-ativação

Depois que o domínio ficar `active`:
- Testar reset de senha (dispara template auth)
- Conferir tabela `email_send_log` para ver status `sent`
- Se algo aparecer como `dlq` ou `failed`, investigamos o `error_message`

## O que NÃO precisa ser refeito

- ✅ Templates de auth (signup, recovery, magic-link, etc.) — já scaffoldados
- ✅ Fila pgmq + cron (`process-email-queue`) — já configurada
- ✅ Server route `/lovable/email/auth/webhook` — já no ar
- ✅ Tabelas `email_send_log`, `email_send_state`, `suppressed_emails` — já existem

**Não vou recriar nada disso** — recriar quebraria o que já funciona. O único trabalho é DNS.

## Próximo passo

Aprove o plano e eu te mostro o botão de setup para você obter os NS records exatos da Hostnet.
