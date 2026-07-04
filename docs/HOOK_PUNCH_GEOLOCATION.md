# OmniBiz — usePunchGeolocation (Passo 4)

> **Status:** Aprovado — v1.0 · **Escopo:** camada cliente de captura GPS.
>
> Nenhuma alteração em DB, RPC ou RBAC.

---

## 1. Arquitetura

```
┌──────────────────────────────────────────────┐
│ UI (Ponto, Gestão, futuros módulos)          │
│   └─ usePunchGeolocation() ─ único gateway   │
├──────────────────────────────────────────────┤
│ src/hooks/use-punch-geolocation.ts           │
│   ├─ estado padronizado (máquina)            │
│   ├─ guarda de concorrência (in-flight)      │
│   ├─ hard timeout (Safari legado)            │
│   └─ classifyAccuracy() do resultado         │
├──────────────────────────────────────────────┤
│ src/lib/geo/accuracy.ts (classifyAccuracy)   │
├──────────────────────────────────────────────┤
│ navigator.geolocation (uso EXCLUSIVO do hook)│
└──────────────────────────────────────────────┘
```

Regra: nenhum componente de feature chama `navigator.geolocation` — apenas
`usePunchGeolocation()`. A classificação visual de precisão vem exclusivamente
de `classifyAccuracy()`; não replicar limiares.

---

## 2. Fluxo de execução

1. Componente chama `capture()`.
2. Se já existe promessa em andamento → devolve a mesma (idempotência).
3. Se `navigator.geolocation` ausente → estado `unavailable` + `GPS_NOT_SUPPORTED`.
4. Consulta `navigator.permissions` (quando disponível):
   - `granted` → estado `capturing`.
   - caso contrário → `requesting_permission`.
5. Chama `getCurrentPosition` com `{ enableHighAccuracy:true, timeout:10000, maximumAge:0 }`.
6. Hard timeout paralelo (`timeout + 500 ms`) protege navegadores que ignoram o `timeout` nativo (Safari legado).
7. Sucesso → normaliza `coords`, calcula `classifyAccuracy`, expõe `reading` e estado `success`.
8. Erro → mapeia código → `permission_denied` | `timeout` | `unavailable` | `error`.

---

## 3. Estados possíveis

| Estado | Momento |
|---|---|
| `idle` | Após montagem ou `reset()`. |
| `requesting_permission` | Aguardando decisão do utilizador. |
| `capturing` | Permissão concedida, GPS respondendo. |
| `success` | Leitura entregue. |
| `permission_denied` | Utilizador ou sistema negou. |
| `timeout` | GPS não respondeu no prazo. |
| `unavailable` | Sem suporte ou POSITION_UNAVAILABLE. |
| `error` | Erro desconhecido. |

---

## 4. Códigos de erro

| Código | Origem |
|---|---|
| `GPS_PERMISSION_DENIED` | `PositionError.PERMISSION_DENIED` |
| `GPS_TIMEOUT` | `PositionError.TIMEOUT` ou hard timeout |
| `GPS_UNAVAILABLE` | `PositionError.POSITION_UNAVAILABLE` |
| `GPS_NOT_SUPPORTED` | `navigator.geolocation` ausente |
| `GPS_UNKNOWN_ERROR` | Fallback |

Mensagens em `PunchGeoError.message` são default — cada tela pode sobrescrever.

---

## 5. Classificação de precisão (`classifyAccuracy`)

| Faixa (m) | Nível | Ícone | Cor semântica |
|---|---|---|---|
| 0–15 | `excellent` | 🟢 | `success` |
| 15–40 | `good` | 🟡 | `warning` |
| 40–80 | `low` | 🟠 | `amber` |
| > 80 ou desconhecida | `very_low` | 🔴 | `destructive` |

Retorno inclui `level`, `icon`, `color`, `label`, `description`, `meters` (valor real).

---

## 6. Compatibilidade validada

| Ambiente | Estado |
|---|---|
| Chrome Android | OK — Permissions API + high accuracy. |
| Chrome Desktop | OK — accuracy tipicamente 🟠/🔴 (Wi-Fi/IP). |
| Safari iPhone | OK — hard timeout cobre casos raros. |
| Safari macOS | OK — Permissions API disponível. |
| Edge Desktop | OK (Chromium). |

Requisitos comuns: contexto HTTPS e primeira solicitação disparada por gesto do utilizador (aplicado nas telas consumidoras).

---

## 7. Performance

- Uma única captura por vez (`inFlightRef`). Chamadas concorrentes retornam a mesma promessa.
- Hard timeout `10.5s` cancela leituras travadas.
- Nenhum `watchPosition` ativo na v1.0 → zero consumo em background.
- `captureDurationMs` disponível para instrumentação (Super Admin).

---

## 8. UX

- Estado `isCapturing` para mostrar indicador de carregamento.
- Sucesso NÃO dispara toast — o hook apenas retorna o resultado.
- Apenas erros disparam mensagens, a critério da tela consumidora.
- Painel `<PunchGeoDiagnostics/>` visível somente a Super Admin.

---

## 9. Evolução futura (API estável)

Preparado sem quebra de contrato:
- captura contínua via `watchPosition`;
- monitorização em segundo plano;
- geofencing em tempo real;
- múltiplos pontos;
- replay.

Todas as extensões adicionam campos/estados novos, mantendo os existentes.

---

## 10. Plano de homologação

1. **Permissão negada** — Safari iOS: negar → estado `permission_denied`.
2. **Timeout** — Chrome DevTools "location: unavailable" → estado `timeout`.
3. **Unavailable** — Firefox modo offline → `unavailable`.
4. **Sucesso urbano** — Android outdoor → 🟢 excelente.
5. **Sucesso desktop** — Wi-Fi → 🟠/🔴 esperado, sem crash.
6. **Concorrência** — clicar 3× "Bater ponto": apenas UMA captura, todas resolvem juntas.
7. **Super Admin diagnóstico** — painel aparece; escondido para Gestor/Funcionário.
8. **RBAC** — matriz `ARCHITECTURE_RBAC.md` inalterada.

---

**Fim — v1.0**