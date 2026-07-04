# OmniBiz — Geofencing Inteligente (Folha de Ponto)

> **Status:** Aprovado — v1.0 · **Escopo:** Validação de localização no início e término de tarefas na Folha de Ponto.
>
> Depende de: [`ARCHITECTURE_RBAC.md`](./ARCHITECTURE_RBAC.md). Nenhuma regra RBAC é alterada por este documento.

---

## 1. Objetivos

- Garantir que o colaborador inicia e termina a tarefa **no local correto do cliente**.
- Registar todos os eventos relevantes do ciclo de execução com localização, para auditoria futura.
- Manter total abstração do provedor de mapas.
- Preparar (sem ativar) captura opcional de fotos no início/término.
- Não confiar em validação apenas do cliente — a distância é sempre recalculada no servidor.

---

## 2. Ajustes funcionais aprovados (v1.0)

Estes ajustes foram incorporados a partir da arquitetura preliminar:

1. **Configurações independentes para início e término** (secção 5).
2. **Classificação visual de accuracy** (secção 6).
3. **Histórico completo de eventos** — `arrival`, `start`, `pause`, `resume`, `stop`, `departure` (secção 7).
4. **Fotos opcionais** — estrutura preparada, captura obrigatória fica para v1.1 (secção 8).
5. **Mapa na gestão de ponto** — cliente + timeline de eventos ligados por linha (secção 9).
6. **Abstração de mapas** — provider trocável sem alterar regras de negócio (secção 10).
7. **Compatibilidade Android / iOS / Desktop** — sem mudanças RBAC (secção 11).

---

## 3. Alinhamento RBAC

| Ação | Perfil |
|---|---|
| Configurar política de geolocalização da empresa | **Gestor** (Owner herda) |
| Definir coordenadas/raio de cada cliente | **Gestor** |
| Executar `punch_start` / `punch_stop` com localização | **Funcionário** (self) |
| Aprovar/justificar ponto fora do raio | **Gestor** (via `punch_admin_update` + `reason`) |
| Auditar geopoints | **Gestor** (empresa) · **Super Admin** (global, herdado) |

Nenhuma nova role, nenhuma nova RLS transversal. As RLS de `time_entries` e `clients` são estendidas para as novas colunas/tabelas mantendo o mesmo predicado por `company_id`.

---

## 4. Camadas

```
┌───────────────────────────────────────────────────────────────┐
│ UI (Ponto do funcionário · Gestão de ponto · Config RH)       │
│   - usePunchGeolocation() hook                                │
│   - <GeoStatusBadge/> (🟢🟡🟠🔴)                              │
│   - <PunchTimelineMap/> via MapProvider (abstração)           │
├───────────────────────────────────────────────────────────────┤
│ Server functions (createServerFn)                             │
│   - punch_start_v2 · punch_stop_v2                            │
│   - punch_event_log (arrival/pause/resume/departure)          │
├───────────────────────────────────────────────────────────────┤
│ DB                                                            │
│   - clients.geo_*                                             │
│   - company_hr_settings.geo_* (start/stop independentes)      │
│   - time_entries.start_geo_* / end_geo_*                      │
│   - time_entry_geopoints (append-only, todos os eventos)      │
│   - time_entry_photos (opcional, v1.0 estrutura apenas)       │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. Configurações independentes (start ≠ stop)

Empresa poderá definir políticas **diferentes** para início e término da tarefa.

### 5.1 Colunas em `company_hr_settings`

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `geo_required_start` | `bool` | `false` | Exige localização ao iniciar. |
| `geo_required_stop` | `bool` | `false` | Exige localização ao terminar. |
| `geo_default_radius_m` | `int` | `50` | Raio padrão quando cliente não define. |
| `geo_out_of_range_policy_start` | `enum` | `alert` | `alert` \| `justify` \| `block` |
| `geo_out_of_range_policy_stop` | `enum` | `alert` | `alert` \| `justify` \| `block` |
| `geo_no_location_policy_start` | `enum` | `alert` | Comportamento quando browser nega geolocalização no início. |
| `geo_no_location_policy_stop` | `enum` | `alert` | Idem no término. |
| `geo_photo_start_enabled` | `bool` | `false` | Prepara UI de captura de foto no início (v1.0 = estrutura). |
| `geo_photo_stop_enabled` | `bool` | `false` | Idem no término. |

### 5.2 Enum de políticas

```sql
create type public.geo_policy as enum ('alert', 'justify', 'block');
```

- `alert` — regista fora do raio, mostra aviso, não bloqueia.
- `justify` — exige `reason` textual antes de submeter.
- `block` — servidor rejeita a operação (RPC retorna erro).

### 5.3 Precedência

`clients.geo_radius_m` (se definido) **sobrescreve** `company_hr_settings.geo_default_radius_m`.
A política (`policy_start` / `policy_stop`) **sempre vem da empresa** — cliente não personaliza política.

---

## 6. Classificação visual de accuracy

O valor real em metros continua a ser gravado em `time_entry_geopoints.accuracy_m`. A UI resolve o bucket visual via helper puro `classifyAccuracy(m)`:

| Bucket | Ícone | Limite (m) |
|---|---|---|
| Excelente | 🟢 | `≤ 20` |
| Boa | 🟡 | `≤ 50` |
| Baixa | 🟠 | `≤ 150` |
| Muito baixa | 🔴 | `> 150` ou desconhecida |

O bucket **não** é persistido — é derivado no render para permitir recalibração futura sem migração.

---

## 7. Histórico completo de eventos

### 7.1 Enum

```sql
create type public.punch_event_kind as enum
  ('arrival', 'start', 'pause', 'resume', 'stop', 'departure');
```

- `arrival` — colaborador chegou ao local (opcional, disparado por proximidade do raio).
- `start` — iniciou tarefa (obrigatório).
- `pause` / `resume` — pausa e retorno.
- `stop` — terminou tarefa (obrigatório).
- `departure` — deixou o local (opcional, simétrico a `arrival`).

### 7.2 Tabela `time_entry_geopoints` (append-only)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `time_entry_id` | `uuid` FK → `time_entries` | |
| `company_id` | `uuid` | espelhado para RLS |
| `event_kind` | `punch_event_kind` | |
| `captured_at` | `timestamptz` | momento no dispositivo |
| `server_at` | `timestamptz` default `now()` | momento no servidor |
| `lat` / `lng` | `double precision` | pode ser `null` se `no_location` |
| `accuracy_m` | `double precision` | valor real reportado |
| `client_lat` / `client_lng` / `client_radius_m` | | snapshot do cliente no momento do evento |
| `distance_m` | `double precision` | calculado em SQL (Haversine) |
| `geo_status` | `enum('within','out_of_range','no_location')` | |
| `reason` | `text` | preenchido quando `justify` |
| `device_fingerprint` | `jsonb` | user-agent, platform, screen |
| `mock_location_suspected` | `bool` default `false` | reservado para v1.1 |

### 7.3 Regras

- `GRANT SELECT, INSERT` para `authenticated`; **sem UPDATE/DELETE** (append-only).
- RLS: `authenticated` lê apenas eventos da sua `company_id`; `Funcionário` lê apenas eventos das suas próprias `time_entries`.
- Distância recalculada sempre pelo servidor via função SQL `public.haversine_m(lat1, lng1, lat2, lng2)`.

---

## 8. Fotos (estrutura preparada, sem captura obrigatória)

### 8.1 Tabela `time_entry_photos`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `time_entry_id` | `uuid` FK | |
| `company_id` | `uuid` | RLS |
| `event_kind` | `punch_event_kind` | restrito a `start` \| `stop` na v1.0 |
| `storage_path` | `text` | bucket `punch-photos` |
| `captured_at` | `timestamptz` | |
| `created_at` | `timestamptz` default `now()` |

### 8.2 Regras v1.0

- Bucket `punch-photos` privado, criado mas **não exposto** na UI enquanto `geo_photo_*_enabled = false`.
- Nenhum RPC de captura obrigatória. O hook `usePunchGeolocation()` expõe hook irmão `usePunchPhoto()` que fica desligado por default.
- Nenhum email/notificação depende de foto.

---

## 9. Mapa na gestão do ponto

Componente `<PunchTimelineMap timeEntryId={...}/>` exibido no drawer `PunchEditorDrawer` / `PunchAuditDrawer`.

### 9.1 Elementos

- Marcador **Cliente** (círculo com raio configurado).
- Marcadores por evento na ordem cronológica: `start` → `pause` → `resume` → `stop`.
- Linha ligando os eventos formando a **timeline geográfica**.
- Cada marcador com badge de accuracy (🟢🟡🟠🔴) e badge de `geo_status`.

### 9.2 Regras

- Nunca renderiza se o cliente não tem coordenadas — mostra empty state com CTA "Definir localização do cliente" (Gestor).
- `arrival` e `departure` renderizam com estilo secundário (semi-transparente).

---

## 10. Abstração de mapas — `MapProvider`

Não acoplar diretamente ao Google Maps.

### 10.1 Contrato (`src/lib/maps/types.ts`)

```ts
export interface MapProvider {
  readonly id: 'google' | 'osm' | 'mapbox';
  Map: React.ComponentType<MapProps>;
  Marker: React.ComponentType<MarkerProps>;
  Circle: React.ComponentType<CircleProps>;
  Polyline: React.ComponentType<PolylineProps>;
  geocodeAddress(q: string): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
}
```

### 10.2 Seleção

- Provider ativo escolhido via `import.meta.env.VITE_MAP_PROVIDER` (`google` por default).
- Chaves de API por provider em variáveis próprias (`VITE_GOOGLE_MAPS_KEY`, `VITE_MAPBOX_TOKEN`).
- OSM não requer chave.
- Trocar provider **nunca** requer alteração de RPC, tabela ou regra de negócio.

### 10.3 Regras

- Nenhum componente de feature importa `@react-google-maps/api` diretamente — só via `useMapProvider()`.
- `geocodeAddress` é usado no cadastro de cliente (autocompletar endereço → lat/lng).

---

## 11. Compatibilidade

| Plataforma | Geolocalização | Notas |
|---|---|---|
| **Android — Chrome** | `navigator.geolocation` | Requer HTTPS. Permissão persistente após primeiro allow. |
| **iOS — Safari** | `navigator.geolocation` | Requer HTTPS e gesto do utilizador para primeira solicitação. |
| **iOS — Chrome** | Idem Safari (mesmo WebKit) | Sem diferenças relevantes. |
| **Desktop — Chrome/Edge/Firefox/Safari** | `navigator.geolocation` | Accuracy tipicamente baixa (Wi-Fi/IP). Bucket 🟠/🔴 esperado. |

### 11.1 Regras

- `usePunchGeolocation()` usa `enableHighAccuracy: true`, `timeout: 15000`, `maximumAge: 0`.
- Se `PermissionStatus === 'denied'` → aplica `geo_no_location_policy_*` conforme a operação (start/stop).
- Todos os fluxos degradam de forma coerente em desktop (accuracy baixa = `alert`/`justify` conforme política, nunca crash).
- **Nenhuma alteração RBAC** — matriz de perfis permanece idêntica à `ARCHITECTURE_RBAC.md`.

---

## 12. Plano de implementação (ordem)

1. **Migração DB** — enums `geo_policy`, `punch_event_kind`, colunas em `clients` e `company_hr_settings`, tabelas `time_entry_geopoints` e `time_entry_photos`, função `haversine_m`, bucket `punch-photos`, RLS + GRANTs.
2. **RPCs** — `punch_start_v2`, `punch_stop_v2`, `punch_event_log`.
3. **Provider de mapas** — contrato + implementação Google (default) + stub OSM.
4. **Hook `usePunchGeolocation`** + helper `classifyAccuracy`.
5. **UI Cliente** — campos geo + autocomplete via provider.
6. **UI Config RH** — start/stop independentes + toggles de foto.
7. **UI Ponto (funcionário)** — badge accuracy + fluxo alert/justify/block.
8. **UI Gestão de ponto** — `<PunchTimelineMap/>` + integração no `PunchEditorDrawer`.
9. **Homologação** — checklist RBAC (`HOMOLOGACAO_RBAC.md`) + testes cross-device.

Fotos (secção 8) permanecem como **estrutura sem UI ativa** até v1.1.

---

**Fim do documento — v1.0**