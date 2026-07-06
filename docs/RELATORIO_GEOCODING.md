# Relatório Técnico — Google Maps `REQUEST_DENIED` (Item 16)

> **Fase:** 1 · **Data:** 2026-07-06 · **Tipo:** Diagnóstico (sem código)
> **KI relacionado:** [KI-001](./KNOWN_ISSUES.md)

## 1. Sintoma

No editor de cliente (`ClientGeoEditor`), ao buscar endereço, console mostra:

```
Error: geocode: REQUEST_DENIED
```

O resultado não é retornado; a caixa de sugestões fica vazia.

## 2. Análise de código

**Arquivo:** `src/lib/maps/providers/google.ts` linhas 178-199.

```ts
async function gatewayGeocode(query: string): Promise<GeocodeResult[]> {
  const gmaps = await loadGoogleMaps();
  const svc = new gmaps.maps.Geocoder();      // ← SDK cliente
  svc.geocode({ address: query }, ...);        // ← usa browser key
}
```

Apesar do nome `gatewayGeocode`, a função **NÃO** usa o gateway Lovable. Ela instancia `google.maps.Geocoder` do SDK JS, que autentica com a `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.

## 3. Causa raiz

A browser key da Lovable é **referrer-restrita** e autorizada APENAS para:

- ✅ Maps JavaScript API
- ✅ Places API (New)
- ❌ **Geocoding API** ← rejeita com `REQUEST_DENIED`
- ❌ Directions API
- ❌ Routes API

Documentado em `google_maps` (contexto do sistema):
> "The browser key is only authorized for the Maps JavaScript API and Places API (New). It is NOT authorized for Geocoding, Routes, or other server-side APIs. For geocoding, routing, and other server-side API calls, ALWAYS use the gateway."

## 4. Verificações eliminadas

| Hipótese | Resultado |
|---|---|
| Billing desativado | ❌ managed key da Lovable tem billing garantido |
| Referrer errado (custom domain) | ❌ projeto publicado em `ominibiz-suite.lovable.app` (dentro de `*.lovable.app`) |
| Cota excedida | ❌ sintoma seria `OVER_QUERY_LIMIT`, não `REQUEST_DENIED` |
| API desabilitada no projeto | ❌ Places funciona (mesmo projeto Google) |
| Environment variable ausente | ❌ Maps JS carrega, portanto BROWSER_KEY existe |

**Única hipótese consistente: uso indevido da browser key para Geocoding.**

## 5. Correção proposta (Fase 3)

### 5.1 Nova server function

`src/lib/maps/geocode.functions.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export const gatewayGeocodeAddress = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ address: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const r = await fetch(
      `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
          "X-Connection-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
        },
      },
    );
    if (!r.ok) throw new Error(`geocode gateway ${r.status}: ${await r.text()}`);
    return r.json();
  });
```

### 5.2 Alteração no provider

`googleMapsProvider.geocode` passa a chamar a server function via `useServerFn`; UI é ajustada para consumir em vez do SDK.

### 5.3 Mesma correção para `reverseGeocode`

## 6. Não mascarar erro

A mensagem `geocode: REQUEST_DENIED` deve continuar aparecendo em `MapDiagnosticsPanel` durante a transição — é o sinal de que uma tela antiga ainda usa o caminho errado.

## 7. Impacto

- **UX:** busca de endereço volta a funcionar.
- **Custo:** geocoding é cobrado por request; volume atual (< 50/dia) é desprezível.
- **Segurança:** melhora — chave sensível deixa de circular no cliente.
- **Mobile-ready:** server function pode ser consumida pelo app mobile futuro sem duplicação.

## 8. Riscos

- Latência: +100-300ms por request (server roundtrip). Aceitável — busca já é debounced.
- Cold start em Cloudflare Workers: primeiro request ~500ms. Aceitável.

**Recomendação: aprovar para Fase 3.**