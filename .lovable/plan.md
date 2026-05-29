
# Envio real de recibos por email — arquitetura preparada para produção

Objetivo: usar **Lovable Emails** como provider inicial, mas com camada de abstração que permita trocar para Resend / SMTP / outro provider sem refactor das chamadas no app.

---

## 1. Camada de abstração de provider

Arquivo novo: `src/lib/email/provider.ts` (server-only)

```ts
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string /*base64*/; contentType: string }[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;   // ex.: { payslip_id, company_id }
};

export type EmailSendResult = {
  provider: "lovable" | "resend" | "smtp";
  provider_message_id: string | null;
  status: "queued" | "sent" | "failed";
  error?: string;
};

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<EmailSendResult>;
}
```

- `LovableEmailProvider` — implementação inicial (server route `/lovable/email/transactional/send` via fila pgmq).
- `ResendEmailProvider` (stub, não habilitado) — esqueleto pronto para o dia que quiserem trocar.
- Factory `getEmailProvider()` lê `process.env.EMAIL_PROVIDER` (default `"lovable"`) → retorna o provider.

Todo o resto do código só conhece a interface `EmailProvider`.

---

## 2. Templates por empresa

Arquivo novo: `src/lib/email/templates/payslip.tsx` (React Email)

Inputs (props):
- `companyName`, `companyLogoUrl`, `companyPrimaryColor`
- `employeeName`
- `periodLabel` (ex.: `"Maio / 2026"`)
- `portalUrl` (signed URL para `/meus-recibos` com deep-link no recibo)
- `confidentialNotice` (texto fixo PT)

Estrutura visual:
1. Header com logo da empresa (fallback iniciais se sem logo).
2. Saudação `"Olá, {employeeName}"`.
3. Bloco: "Seu recibo de **{periodLabel}** está disponível."
4. CTA **Baixar recibo** → `portalUrl`.
5. Nota: "Documento confidencial. Não compartilhe."
6. Footer com nome da empresa + "enviado via {AppName}".

Subject: `"Recibo de {periodLabel} — {companyName}"`.

Registrado em `src/lib/email-templates/registry.ts` como `payslip-published`. Dados dinâmicos vêm em `templateData`.

---

## 3. Schema — novas colunas + tabela de eventos

Migration nova (não edita existente):

```sql
alter table public.payslips
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists email_downloaded_at timestamptz,
  add column if not exists email_attempts int not null default 0,
  add column if not exists last_attempt_at timestamptz;

-- Indices para o dashboard
create index if not exists payslips_company_email_status_idx
  on public.payslips(company_id, email_delivery_status);
```

`payslip_email_events` já existe — vamos usar para `queued|sent|delivered|opened|bounced|failed|downloaded`.

Tracking de download: quando o funcionário gera signed URL, RPC `payslip_record_download(_id)` faz `update payslips set email_downloaded_at = now()` + insert em events. Estrutura para `opened_at` fica pronta (webhook de open ainda não plugado).

---

## 4. Server functions

`src/lib/payslips.functions.ts` ganha:

- `publishPayslip({ id })` — orquestra envio:
  1. Carrega payslip + profile do funcionário + company (logo, cor, nome).
  2. Gera signed URL (7 dias) para download.
  3. Baixa o PDF do storage; se < 8 MB → anexa, senão só link.
  4. Renderiza template via `render(<PayslipEmail .../>)`.
  5. `provider.send(msg)` → atualiza `payslips` (`provider`, `provider_message_id`, `email_delivery_status`, `email_sent_at`, `email_attempts++`, `last_attempt_at`).
  6. Insere `payslip_email_events` (sent/failed + error).
  7. Cria `notification` (event `payslip_published`) → realtime já existente atualiza sino.
  8. Marca `payslip.status='sent'` (ou `failed`).

- `bulkPublishPayslips({ ids })` — loop sequencial com pequena pausa; agrega resultados.

- `recordPayslipDownload({ id })` — chamado por `/meus-recibos` ao baixar; RLS garante que só o dono atualiza.

Erros: try/catch por payslip; nunca derruba a chamada inteira.

---

## 5. Notificação in-app

- Novo `notification.event = 'payslip_published'` (extende enum existente).
- Trigger no insert do `notification` já está em uso pelos outros eventos → sino atualiza automaticamente via realtime.
- Em `/meus-recibos`, ao clicar a notificação → navega para `/meus-recibos?highlight={payslip_id}` (scroll + ring).

---

## 6. Dashboard gestor (atualização de `/app/rh/recibos`)

Cards adicionais:
- **Processados** (parse_confidence >= 0.6)
- **Enviados** (`email_delivery_status in (sent,delivered)`)
- **Falhados** (`failed|bounced`)
- **Abertos** (`email_opened_at not null`) — placeholder até webhook
- **Baixados** (`email_downloaded_at not null`)

Tabela ganha colunas: `Provider`, `Tentativas`, `Última tentativa`, `Status entrega` (badge colorido), botão **Reenviar** (chama `publishPayslip` de novo, incrementa attempts).

Drawer de detalhes mostra timeline de `payslip_email_events`.

---

## 7. Multiempresa

- `getEmailProvider()` no futuro pode receber `companyId` e ler config por empresa (`companies.email_config jsonb`). MVP: provider global, **template e remetente contextualizados por empresa via templateData** (logo + nome no corpo, "via {AppName}" no footer).
- `from` continua sendo o domínio Lovable Emails verificado (uma única infraestrutura), `reply-to` = email da empresa quando existir (`companies.email`).
- Estrutura pronta para por-empresa-domain quando quiserem ativar Resend white-label.

---

## 8. Logs obrigatórios (resumo)

Em cada envio gravamos em `payslips`:
- `provider`, `provider_message_id`
- `email_sent_at`, `email_delivery_status`, `email_error`
- `email_attempts`, `last_attempt_at`
- `email_opened_at` (preparado), `email_downloaded_at`

E uma linha por transição em `payslip_email_events` (`event`, `detail`, `created_at`).

Auditável e pronto para futuras métricas.

---

## 9. Pré-requisitos a executar

1. Configurar domínio de email (dialog de setup Lovable Emails).
2. `setup_email_infra` (fila + cron).
3. `scaffold_transactional_email` (rotas + registry).
4. Criar template `payslip-published`.
5. Migration colunas + RPC download.
6. Server fns + UI de reenvio + dashboard.

---

## 10. Fora desta fase

- Webhook real de open/bounce do provider (estrutura já aceita; basta plugar handler).
- Provider Resend ativo (esqueleto fica, ativação fica para quando quiserem).
- Email por empresa em domínio próprio.

Confirma que sigo com esta arquitetura?
