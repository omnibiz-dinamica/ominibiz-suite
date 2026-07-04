# OmniBiz — Map Provider (Passo 3)

> **Status:** Aprovado — v1.0 · **Escopo:** Abstração única para mapas.
> Depende de: [`ARCHITECTURE_GEOFENCING.md`](./ARCHITECTURE_GEOFENCING.md).
> **Nenhuma regra de negócio vive dentro do provider.**

---

## 1. Requisitos aprovados

1. **Provider único** — toda interação com mapas passa por `MapProvider`.
2. **Independência do fornecedor** — Google (ativo), OSM e Mapbox (stubs).
3. **Componentes reutilizáveis** — `GeoMap`, `GeoMarker`, `GeoCircle`, `GeoRoute`, `GeoTimeline`.
4. **Performance** — instância do mapa mantida viva; só marcadores/círculos/linhas atualizam.
5. **Responsividade** — Desktop, Tablet, Mobile.
6. **Offline** — fallback com lat/lng/distância/accuracy/endereço.
7. **Preparação futura** — Heat Map, Replay, Múltiplos marcadores, Cluster, Cercas múltiplas.
8. **Diagnóstico Super Admin** — `MapDiagnosticsPanel`.
9. **Nenhuma regra de negócio** dentro do provider.

---

## 2. Camadas

```
┌──────────────────────────────────────────────────────┐
│ Features (Ponto, Clientes, Frota, …)                 │
│   └─ importam APENAS de @/components/maps            │
├──────────────────────────────────────────────────────┤
│ Reusable components — @/components/maps              │
│   GeoMap · GeoMarker · GeoCircle · GeoRoute          │
│   GeoTimeline · GeoOfflineFallback                   │
│   MapDiagnosticsPanel (Super Admin)                  │
├──────────────────────────────────────────────────────┤
│ Provider abstraction — @/lib/maps                    │
│   getMapProvider()  ←  VITE_MAP_PROVIDER             │
│   MapProvider { mount, geocode, reverseGeocode }     │
│   MapHandle { addMarker, drawCircle, drawPolyline,   │
│               fitBounds, setCenter, clear, destroy } │
├──────────────────────────────────────────────────────┤
│ Provider implementations                             │
│   google.ts  (ativo)                                 │
│   osm.ts     (stub v1.0)                             │
│   mapbox.ts  (stub v1.0)                             │
└──────────────────────────────────────────────────────┘
```

---

## 3. Contrato `MapProvider`

| Método | Retorno | Observação |
|---|---|---|
| `id` | `'google' \| 'osm' \| 'mapbox'` | Identificador estático. |
| `displayName` | `string` | Para UI de diagnóstico. |
| `isAvailable()` | `boolean` | Falha limpa quando credenciais ausentes. |
| `mount(opts)` | `Promise<MapHandle>` | Carrega o SDK lazy e devolve handle imperativo. |
| `geocode(q)` | `Promise<GeocodeResult[]>` | Autocomplete/busca de endereço. |
| `reverseGeocode(pos)` | `Promise<string \| null>` | Endereço a partir de lat/lng. |

`MapHandle` mantém a instância viva. Featues nunca chamam SDK do provider.

---

## 4. Componentes criados

| Componente | Papel |
|---|---|
| `<GeoMap/>` | Container. Monta o provider uma vez e expõe `MapHandle` via contexto. |
| `<GeoMarker/>` | Marcador declarativo — diff idempotente por `id`. |
| `<GeoCircle/>` | Círculo (usado para raio do cliente no Geofencing). |
| `<GeoRoute/>` | Polyline (usado para timeline de eventos e futuros replays). |
| `<GeoTimeline/>` | Sequência ordenada de marcadores + polyline conectando. |
| `<GeoOfflineFallback/>` | Fallback textual com lat/lng/accuracy/distância/endereço. |
| `<MapDiagnosticsPanel/>` | Painel restrito a Super Admin. |

Todos vivem em `src/components/maps/` e são exportados por `@/components/maps`.

---

## 5. Impacto na UI

- Nenhum módulo existente foi alterado nesta etapa.
- Passo 8 do plano de Geofencing passará a consumir `<GeoMap>` + `<GeoTimeline>` em vez do componente `<PunchTimelineMap/>` previsto — mesma superfície, menor acoplamento.
- Cadastro de cliente (passo 5) usará `getMapProvider().geocode()` para autocomplete.

---

## 6. Estratégia de performance

- `GeoMap` monta o provider **uma única vez** (`useEffect` sem dependências) e destrói apenas ao desmontar.
- Atualizações de `center` são empurradas via `handle.setCenter()` — sem remount.
- Marcadores/círculos/linhas seguem padrão idempotente: cada `add*` reaproveita a entidade existente pelo `id`.
- Ring buffer de diagnóstico limitado a 200 eventos.

---

## 7. Responsividade

- `<GeoMap>` ocupa 100% do container pai (`w-full`, `min-h-[240px]`).
- Em mobile, o container deve receber altura fixa (ex.: `h-64`) via classe do consumidor.
- Provider Google usa `gestureHandling: 'greedy'` para permitir pan de um dedo em mobile.
- Modo `interactive={false}` desativa UI e gestos — usado em previews compactos.

---

## 8. Offline / degradação

`<GeoMap>` cai para `<GeoOfflineFallback>` (ou `fallback` custom) quando:

- Provider retorna `isAvailable() === false`.
- `mount()` falha (rede, chave inválida, script bloqueado).

O fallback expõe: latitude, longitude, accuracy, distância e endereço quando disponíveis, de modo que **operação nunca fica travada** por indisponibilidade de mapa.

---

## 9. Estratégia de troca de provider

1. Definir `VITE_MAP_PROVIDER=osm|mapbox|google` no `.env`.
2. `getMapProvider()` resolve pelo registry — nenhum import de feature muda.
3. Providers `osm` e `mapbox` já expõem o contrato (stubs); basta implementar `mount/geocode/reverseGeocode`.
4. Nenhuma tabela, RPC, RLS ou regra RBAC é afetada.

---

## 10. Preparação para funcionalidades futuras

| Recurso futuro | Encaixe no contrato atual |
|---|---|
| **Heat Map** | Novo método opcional `drawHeatmap(points)` no `MapHandle`. Nenhum breaking change. |
| **Replay de rota** | Consome `<GeoTimeline>` + `handle.setCenter()` animado. |
| **Múltiplos marcadores** | `<GeoMarker>` já é idempotente por `id`; basta renderizar N. |
| **Clusterização** | Novo componente `<GeoCluster>` que agrupa `MarkerOptions[]` e delega ao provider. |
| **Cercas geográficas múltiplas** | N × `<GeoCircle>` no mesmo `<GeoMap>` — sem alterações no provider. |

---

## 11. Diagnóstico

- Bus interno (`recordMapDiagnostic`) captura `mount`, `geocode`, `reverse` e falhas com duração em ms.
- `<MapDiagnosticsPanel/>` renderiza somente para `isSuperAdmin`.
- Sem PII: só provider, tipo, duração e mensagem de erro.

---

## 12. Plano de homologação

| Item | Como validar |
|---|---|
| Provider único | `rg "@react-google-maps\|maps.googleapis" src/` só retorna arquivos de `src/lib/maps/`. |
| Troca por env | Rodar com `VITE_MAP_PROVIDER=osm` → `<GeoMap>` cai em fallback sem erros. |
| Instância viva | Alterar `center` prop não recria o `<div>` do mapa (verificar no DevTools). |
| Offline | Bloquear `maps.googleapis.com` no DevTools → fallback textual visível. |
| Responsivo | Ponto em Chrome 1440, iPad 768, iPhone 375 — pan de um dedo funciona. |
| Diagnóstico | Login como Super Admin → painel visível; login como Gestor → oculto. |
| RBAC | `HOMOLOGACAO_RBAC.md` — nenhuma role/RLS foi alterada. |

---

## 13. Regra permanente

> Nenhum componente de feature pode importar `@react-google-maps/api`,
> `mapbox-gl`, `leaflet`, `google.maps.*` global, ou qualquer SDK de mapa
> diretamente. **A porta única é `@/components/maps` e `@/lib/maps`.**

---

**Fim do documento — v1.0**