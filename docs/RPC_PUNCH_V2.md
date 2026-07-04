# OmniBiz — RPCs Punch v2 (Geofencing)

> **Status:** Passo 2 concluído · Migração aplicada · Nenhuma alteração de schema · RPCs v1 preservadas.

---

## 1. RPCs criadas

| RPC | Método | Descrição |
|---|---|---|
| `punch_start_v2(jsonb)` | INSERT `time_entries` + `geopoints(start)` | Inicia tarefa. Cria o registo. |
| `punch_pause_v2(jsonb)` | UPDATE `paused_at` + `geopoints(pause)` | Pausa. |
| `punch_resume_v2(jsonb)` | UPDATE `resumed_at` + `geopoints(resume)` | Retoma. |
| `punch_stop_v2(jsonb)` | UPDATE `ended_at`, `effective_minutes` + `geopoints(stop)` | Finaliza. |
| `punch_arrival_v2(jsonb)` | `geopoints(arrival)` | Opcional, antes/durante start. |
| `punch_departure_v2(jsonb)` | `geopoints(departure)` | Opcional, após stop. |

Helpers internos: `_punch_last_accepted_event`, `_punch_state`, `_punch_resolve_policy`, `_punch_log_geopoint`, `_punch_evaluate_geo`.

### 1.1 Contrato de entrada (JSONB comum)

```jsonc
{
  "time_entry_id": "uuid",         // não em start (recebe task_id)
  "task_id":       "uuid",         // apenas em start
  "lat":           41.15,          // opcional
  "lng":           -8.61,          // opcional
  "accuracy_m":    18.4,           // opcional
  "gps_status":    "ok",           // ok|denied|timeout|no_location
  "captured_at":   "2026-07-04T13:30:00Z", // audit only
  "reason_text":   "cliente em obra vizinha", // opcional
  "device_fingerprint": { "ua": "...", "platform": "..." }
}
```

### 1.2 Contrato de saída (padronizado)

```jsonc
{ "success": true|false, "code": "PUNCH_STARTED", "message": "...", "data": { ... } }
```

---

## 2. Máquina de estados

Estado derivado por RPC (não persistido em coluna dedicada; ler via `_punch_state`).

```
  none ──(arrival)──▶ arrival ──(start)──▶ start ◀──(resume)── pause
                                 │            │                  ▲
                                 └──(stop)────┼──(pause)─────────┘
                                              ▼
                                            stop ──(departure)──▶ departure
```

### 2.1 Estados permitidos

| De ↓ / Para → | arrival | start | pause | resume | stop | departure |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **none**      | ✅¹ | ✅ | 🔴 | 🔴 | 🔴 | 🔴 |
| **arrival**   | ⚪ idempotente | ✅ | 🔴 | 🔴 | ✅ | 🔴 |
| **start**     | 🔴 | ⚪ idempotente (20s) | ✅ | 🔴 | ✅ | 🔴 |
| **pause**     | 🔴 | 🔴 | ⚪ idempotente (20s) | ✅ | ✅ | 🔴 |
| **stop**      | 🔴 | 🔴 | 🔴 | 🔴 | ⚪ idempotente (20s) | ✅ |
| **departure** | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ⚪ idempotente |

¹ `arrival` a partir de `none` exige que a entry já exista (v1.0 aceita apenas se houver `time_entry_id` ativo). Uma variante "arrival cria entry rascunho" fica para v1.1.

### 2.2 Estados bloqueados → código retornado

Sempre `INVALID_STATE` no `code`, com `data.state` indicando o estado atual.

---

## 3. Códigos padronizados

### 3.1 Sucesso

`PUNCH_STARTED` · `PUNCH_PAUSED` · `PUNCH_RESUMED` · `PUNCH_STOPPED` · `PUNCH_ARRIVED` · `PUNCH_DEPARTED`

### 3.2 Erro

| Code | Motivo |
|---|---|
| `UNAUTHENTICATED` | `auth.uid()` nulo |
| `INVALID_INPUT` | payload incompleto (ex.: sem `task_id` no start) |
| `TASK_NOT_FOUND` | task inexistente |
| `ENTRY_NOT_FOUND` | `time_entry_id` inexistente ou de outro user |
| `INVALID_STATE` | transição não permitida |
| `OUT_OF_RADIUS` | fora do raio e política `block` |
| `NO_GPS` / `GPS_DENIED` / `GPS_TIMEOUT` | localização ausente e política `block` |
| `NEEDS_JUSTIFICATION` | política `justify` sem `reason_text` |
| `CLIENT_WITHOUT_LOCATION` | (informativo em `data`; nunca bloqueia) |

---

## 4. Idempotência

Janela de **20 segundos**. Um duplo-clique no mesmo evento retorna `success:true` + `data.idempotent:true` sem inserir segunda linha, sem duplicar `geopoint`, sem alterar timestamps.

Chave de idempotência:
- **start** → `(user_id, task_id, entry_aberto, started_at ≤ 20s)`
- **pause/resume/stop/departure/arrival** → `(time_entry_id, last_state, transition_ts ≤ 20s)`

---

## 5. Tempo do servidor

Todas as escritas usam `NOW()` (`server_at`, `started_at`, `paused_at`, `resumed_at`, `ended_at`). O `captured_at` do dispositivo é gravado **apenas como auditoria** em `time_entry_geopoints.captured_at`.

---

## 6. Log de tentativas (rejeitadas)

Registadas em `time_entry_geopoints` com convenção:

- `reason_text` prefixado com `__REJECTED__:<CODE>` (ex.: `__REJECTED__:OUT_OF_RADIUS`).
- `_punch_last_accepted_event` filtra o prefixo → o estado lógico **não é corrompido**.
- Filtro para o Gestor: `WHERE reason_text LIKE '__REJECTED__%'`.

**Limitação v1.0:** rejeição de `start` (que ainda não tem `time_entry_id`) só devolve o código no retorno — não vai para `geopoints` por causa da FK `time_entry_id NOT NULL`. Rejeições em `stop/pause/resume/departure/arrival` **são registadas** normalmente. Uma tabela `punch_attempts_log` fica proposta para v1.1 (não altera schema agora).

---

## 7. Tratamento de erros — matriz política

| Cenário | `alert` | `justify` | `block` |
|---|---|---|---|
| Dentro do raio | ✅ aceita | ✅ aceita | ✅ aceita |
| Fora do raio | ✅ aceita, `geo_status=out_of_range` | ✅ se `reason_text` presente, senão `NEEDS_JUSTIFICATION` | 🔴 `OUT_OF_RADIUS` + log rejeição |
| Sem GPS (`no_loc_policy_*`) | ✅ aceita, `geo_status=no_location` | ✅ se `reason_text`, senão `NEEDS_JUSTIFICATION` | 🔴 `GPS_DENIED`/`GPS_TIMEOUT`/`NO_GPS` |
| Cliente sem lat/lng | ✅ aceita, `CLIENT_WITHOUT_LOCATION` (informativo) | ✅ (idem) | ✅ (idem — política não se aplica) |

---

## 8. Impacto em desempenho

- **1 transação por chamada.** Cada RPC roda em `SECURITY DEFINER` com todas as leituras (tarefa, cliente, política, último evento) e escritas na mesma execução.
- **Consultas por chamada** (contagem aproximada):
  - `punch_start_v2`: 1× SELECT task, 1× SELECT last entry, 1× SELECT policy (join `hr_settings`+`clients`), 1× INSERT entry, 1× INSERT geopoint. **≤ 5 statements.**
  - `punch_stop_v2`: 1× SELECT entry, 1× SELECT client, 1× SELECT policy, 1× UPDATE entry, 1× INSERT geopoint. **≤ 5 statements.**
  - `punch_pause/resume/arrival/departure_v2`: 1× SELECT entry, 1× UPDATE entry (não em arrival/departure), 1× INSERT geopoint. **≤ 3 statements.**
- Índice existente `idx_geopoints_time_entry (time_entry_id, server_at desc)` cobre `_punch_last_accepted_event`.
- `haversine_m` é `IMMUTABLE` puro SQL — sem custo de I/O.
- Sem locks explícitos; concorrência controlada por FK e pela janela de idempotência.

---

## 9. Compatibilidade

- **RPCs v1** (`punch_start`, `punch_stop`, etc.) **inalteradas**. Continuam a ser chamadas pela UI atual.
- Nenhuma coluna/tabela nova.
- UI só passa a chamar `*_v2` quando o Passo 7 (UI Ponto) for concluído e homologado.

---

## 10. Plano de homologação

### 10.1 Testes funcionais (executar via `supabase.rpc(...)` autenticado)

| # | Cenário | Esperado |
|---|---|---|
| T1 | `start` dentro do raio | `PUNCH_STARTED`, `geo_status=within` |
| T2 | `start` fora do raio + `policy_start=alert` | `PUNCH_STARTED`, `geo_status=out_of_range` |
| T3 | `start` fora + `policy_start=justify` sem `reason_text` | `NEEDS_JUSTIFICATION` |
| T4 | `start` fora + `policy_start=justify` com `reason_text` | `PUNCH_STARTED` |
| T5 | `start` fora + `policy_start=block` | `OUT_OF_RADIUS`, sem entry criada |
| T6 | `start` 2× em ≤ 20s | 2ª = `PUNCH_STARTED` com `idempotent:true` |
| T7 | `start` → `start` (após 20s) | `INVALID_STATE` |
| T8 | `pause` → `pause` | 1ª aceita, 2ª idempotente (≤20s) ou `INVALID_STATE` |
| T9 | `resume` sem `pause` | `INVALID_STATE` |
| T10 | `stop` sem `start` (entry_id inválido) | `ENTRY_NOT_FOUND` |
| T11 | `stop` sem GPS + `no_loc_policy_stop=block` | `GPS_DENIED` + log rejeição em `geopoints` |
| T12 | `departure` sem `stop` | `INVALID_STATE` |
| T13 | `stop` fora + `policy_stop=block` | `OUT_OF_RADIUS` + log rejeição |
| T14 | `stop` normal | `PUNCH_STOPPED`, `effective_minutes` calculado |

### 10.2 Testes RBAC

| # | Item | Esperado |
|---|---|---|
| R1 | Chamada sem sessão | `UNAUTHENTICATED` |
| R2 | User A tentando `stop` de entry do User B | `ENTRY_NOT_FOUND` |
| R3 | Super Admin lê `geopoints` (todos os companies) | via RLS existente — sem alteração |

### 10.3 Verificações

- [ ] Timestamps `started_at`/`ended_at` sempre `now()` do servidor.
- [ ] `time_entry_geopoints.server_at` sempre `now()`.
- [ ] `time_entry_geopoints.distance_m` recalculada em SQL (não vem do cliente).
- [ ] Nenhuma linha em `geopoints` com `UPDATE`/`DELETE` (triggers `trg_geopoints_no_update/delete` já ativos).
- [ ] Últimos eventos aceites por entry conferem com `_punch_state`.
- [ ] Chamadas repetidas em janela de 20s não criam linhas duplicadas.

### 10.4 Bloqueadores conhecidos → v1.1

- Rejeição de `start` não fica em `geopoints` (FK NOT NULL). Proposta: tabela `punch_attempts_log(user_id, task_id, code, payload, created_at)`.
- `arrival` a partir de `none` (sem entry) exige criação de entry-rascunho — mantido fora do escopo.
- `mock_location_suspected` reservado para heurísticas de anti-fraude.

---

**Fim do relatório — Passo 2 concluído.**