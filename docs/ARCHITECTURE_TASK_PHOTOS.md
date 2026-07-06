# Arquitetura — Fotos e Comprovação de Execução (Item 12)

> **Status:** Proposta · **Fase de implementação:** 7+ (não implementar agora) · **Data:** 2026-07-06
> **Dependências:** `ARCHITECTURE_GEOFENCING.md`, `ARCHITECTURE_PRINCIPLES.md` (§8 proof-of-work).

## 1. Objetivo

Fornecer arquitetura completa (sem código) para comprovação visual da execução de tarefas — inicialmente para clientes COIFA e escalável a qualquer perfil operacional futuro.

## 2. Escopo

| Recurso | Descrição |
|---|---|
| Foto Antes | Estado inicial do local |
| Foto Depois | Estado final do local |
| Foto por Item | Foto vinculada a checklist item (opcional) |
| Geolocalização | Lat/lng/accuracy no momento da foto |
| Horário | Timestamp servidor + EXIF |
| Checklist | Integração com `task_checklists` |
| IA validação | Score de limpeza; comparação antes/depois |
| Compressão | Client-side antes do upload |
| Offline | Fila IndexedDB + retry |
| Storage | Bucket privado por empresa |
| Custos | Estimado + política de retenção |
| LGPD | Sem rosto humano; retention configurável |
| Assinatura | Funcionário e/ou cliente |
| Relatório | PDF "Certificado de Execução" |

## 3. Modelo de dados (target)

```sql
CREATE TABLE public.task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  checklist_item_id uuid NULL REFERENCES task_checklist_items(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('before','after','item','signature')),
  storage_path text NOT NULL,           -- {company}/{task}/{uuid}.webp
  content_hash text NOT NULL,           -- sha256 anti-tamper
  captured_at timestamptz NOT NULL,     -- do cliente (auditoria)
  received_at timestamptz DEFAULT now(),-- do servidor (autoridade)
  geo_lat double precision NULL,
  geo_lng double precision NULL,
  geo_accuracy_m double precision NULL,
  exif jsonb NULL,
  ai_metadata jsonb NULL,               -- score, tags, prompt_version
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

GRANTs + RLS (padrão): SELECT/INSERT ao `authenticated` limitado por `company_id`; UPDATE/DELETE apenas Super Admin (append-only para funcionário/gestor).

## 4. Storage

- **Bucket:** `task-photos` (privado).
- **Path:** `{company_id}/{task_id}/{yyyy-mm-dd}/{uuid}.webp`.
- **URLs:** signed URL com TTL 15min gerada sob demanda.
- **Backup:** política de retenção default 24 meses; configurável por empresa.

## 5. Compressão cliente

- Lib: `browser-image-compression`.
- Target: 1600px lado maior · qualidade 0.8 · WebP quando suportado.
- Original preservado localmente até confirmação de upload (offline).
- Tamanho médio esperado: 150-250 KB por foto.

## 6. Offline-first

```
Foto → compressão → IndexedDB queue → tenta upload
  ├─ sucesso: remove da fila, marca sincronizado
  └─ falha: retry exponencial (30s, 2min, 10min, 1h)
```

Lib sugerida: `idb-keyval`. Sinal visual "1 foto pendente de envio" no header.

## 7. IA de validação (opcional, Fase pós-v1)

Chamada assíncrona **após upload** via Lovable AI Gateway:

- Modelo: `google/gemini-2.5-flash` (vision).
- Prompt: comparação before/after → score 0-100 + anomalias.
- Resultado gravado em `task_photos.ai_metadata`:

```json
{
  "score": 87,
  "issues": ["mancha residual canto superior direito"],
  "model": "gemini-2.5-flash",
  "prompt_version": "clean-v1",
  "scored_at": "2026-07-10T14:23:00Z"
}
```

**Score < 60** dispara notificação para gestor auditar.

## 8. Custos estimados

Base: 30 tarefas/dia × 6 fotos × 200 KB × 30 dias = **~1.05 GB/mês por empresa**.

| Item | Custo unitário | Volume mensal | Total/empresa/mês |
|---|---|---|---|
| Storage | ~$0.02/GB | 1 GB | $0.02 |
| Egress (signed URL views) | ~$0.09/GB | ~2 GB | $0.18 |
| IA validação | $0.075/1M input tokens | ~180 chamadas | ~$0.10 |
| **Total estimado** | | | **~$0.30** |

Marginal por empresa. Escalável.

## 9. LGPD e privacidade

- **Proibição explícita** de captura de rosto humano — validação client-side via detecção facial rápida (`face-api.js` ou heurística).
- **Overlay obrigatório** na câmera: "Uso restrito a auditoria interna".
- **Retention configurável** por empresa (padrão 24 meses; mín. 6, máx. 60).
- **Direito ao esquecimento:** DELETE cascata de fotos ao remover cliente ou funcionário mediante solicitação.
- **Auditoria:** cada acesso a signed URL logado em `domain_events` (`task_photo.accessed`).

## 10. Assinatura

Componente `<SignaturePad>` (lib `signature_pad`):

- Funcionário assina no fim da tarefa → PNG → `task_photos.kind = 'signature'` com metadata `{ signer_role: 'employee' }`.
- Opcional: assinatura do cliente presencial → `{ signer_role: 'client', signer_name, signer_document }`.

## 11. Certificado de Execução (PDF)

Server function `generate_execution_certificate(task_id)`:

1. Query: dados da tarefa + cliente + geopoints + fotos + checklist + assinaturas.
2. Render via `@react-pdf/renderer` (já em uso em contratos).
3. Cabeçalho com logo da empresa.
4. Grid antes/depois.
5. Checklist marcado.
6. Mapa estático (Google Static Maps via gateway) com pontos de arrival/start/stop/departure.
7. Assinaturas ao final.
8. QR de validação (URL pública read-only com hash).

## 12. Roadmap sugerido

| Fase | Entrega |
|---|---|
| 7 (junto do checklist) | Schema `task_photos` + upload básico + display |
| 8 | Assinatura funcionário + retention configurável |
| 9 | IA de validação (score) |
| 10 | Certificado PDF + QR de validação |
| 11 | Assinatura cliente presencial + fluxo COIFA completo |

## 13. O que NÃO fazer

- ❌ Armazenar fotos em base64 no banco.
- ❌ Público bucket (mesmo com URL não-listável).
- ❌ Upload sem compressão.
- ❌ IA síncrona bloqueando UI.
- ❌ Capturar EXIF sem sanitização (pode conter dados sensíveis).

---

**Este documento é a fonte de verdade para implementação futura. Nenhum código será escrito até aprovação explícita da fase correspondente.**