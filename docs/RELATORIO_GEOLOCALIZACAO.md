# Relatório Técnico — Geolocalização (Item 09)

> **Fase:** 1 · **Data:** 2026-07-06 · **Tipo:** Diagnóstico (sem código)

## 1. Estado atual

- Hook único `usePunchGeolocation` (`src/hooks/use-punch-geolocation.ts`).
- Classificação em 4 níveis via `classifyAccuracy` (`src/lib/geo/accuracy.ts`):
  - 🟢 Excelente ≤ 15m
  - 🟡 Boa ≤ 40m
  - 🟠 Baixa ≤ 80m
  - 🔴 Muito baixa > 80m ou desconhecida
- Captura via `navigator.geolocation.getCurrentPosition` (leitura única).
- Políticas por operação em `company_hr_settings` (start/stop, `alert`/`justify`/`block`).

## 2. Riscos identificados

| # | Risco | Cenário | Impacto |
|---|---|---|---|
| R1 | Timeout indefinido em iOS Safari | GPS desligado, sem WiFi | Botão trava indefinidamente |
| R2 | Accuracy inflada indoor | Prédios, estacionamentos | Bloqueio indevido do funcionário no local correto |
| R3 | Sem cache entre operações consecutivas | Arrival→Start em 5s | Duas chamadas GPS, consumo de bateria |
| R4 | Leitura única não refina | GPS demora 3-8s para "prender" satélites | Aceita primeira leitura WiFi (~50m) mesmo quando GPS chegaria a 5m em 6s |
| R5 | Sem distinção de fonte | GPS vs WiFi vs IP | Impossível auditar qualidade real |
| R6 | Permissão negada é opaca | Usuário nega | Erro genérico, sem instrução de recuperação |
| R7 | Modo avião silencioso | Offline | Falha sem mensagem clara |

## 3. Estratégia recomendada

**Substituir `getCurrentPosition` por `watchPosition` com refinamento progressivo.**

```
┌─ t=0     Solicita GPS (highAccuracy=true, maximumAge=15s)
├─ t=0-2s  Aceita primeira leitura (mesmo WiFi ~30-50m) — libera UI
├─ t=2-8s  Continua refinando; substitui posição se accuracy melhorar
├─ t=8s    Encerra watch, commita melhor leitura
└─ t=12s   Timeout duro → estado "no_gps" com fallback justificado
```

**Parâmetros:**

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `enableHighAccuracy` | `true` | GPS puro quando disponível |
| `maximumAge` | `15000` ms | Reuso entre Arrival→Start consecutivos |
| `timeout` (soft) | `8000` ms | Encerra refinamento |
| `timeout` (hard) | `12000` ms | Cancela watch |
| Threshold aceitar cedo | `≤ 60m` | Libera UI rápido em bom sinal |
| Threshold "muito baixa" | `> 100m` após 3 tentativas | Ativa fallback manual |

## 4. Fallback manual justificado

Quando accuracy persistir > 100m ou permissão negada:

- Modal "GPS indisponível — descreva sua localização"
- Campo obrigatório de justificativa (≥ 20 chars)
- Registro em `time_entry_geopoints` com `kind = 'fallback_manual'` e `accuracy = null`
- Notificação ao gestor via `domain_events` (`punch.manual_fallback_used`)

## 5. Diagnóstico Super Admin

Estender `PunchGeoDiagnostics` com:
- Timeline das leituras (t=0, t=2s, t=6s, final)
- Distribuição de accuracy do último dia
- Taxa de uso do fallback manual por empresa

## 6. Compatibilidade

| Browser | Suporte watchPosition | Observação |
|---|:-:|---|
| Chrome Android | ✅ | ideal |
| Safari iOS | ✅ | requer HTTPS |
| Chrome Desktop | ✅ | precisão limitada (WiFi/IP) |
| Firefox | ✅ | ok |
| Edge | ✅ | ok |

## 7. Custos e privacidade

- Sem custo adicional (API nativa do navegador).
- LGPD: já contemplado pelo consentimento na primeira permissão do browser.
- Retenção de `time_entry_geopoints`: manter política atual (append-only, sem TTL definido → propor 24 meses em ADR futura).

## 8. Recomendação

Implementar em **Fase 6** com feature flag `geo_progressive_refinement_enabled` em `company_hr_settings` para rollback rápido. Manter `getCurrentPosition` como fallback controlado.

**Nenhum impacto em RBAC, RLS, banco (só nova coluna booleana) ou multiempresa.**