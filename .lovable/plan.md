## Objetivo

Tornar o OmniBiz um PWA instalável e empacotá-lo como APK Android (TWA — Trusted Web Activity) para distribuição interna, sem service worker (evita problemas de cache no preview do Lovable e mantém o app simples).

## Etapa 1 — Configurar PWA no projeto (eu faço)

**1. Gerar ícones do app**
- `public/icon-192.png` (192×192)
- `public/icon-512.png` (512×512)
- `public/icon-maskable-512.png` (512×512, com safe-zone para Android adaptive icons)
- `public/apple-touch-icon.png` (180×180, iOS)

Usar a identidade visual OmniBiz (gerar via imagegen com fundo sólido na cor primária).

**2. Criar `public/manifest.webmanifest`**
```json
{
  "name": "OmniBiz",
  "short_name": "OmniBiz",
  "description": "Operação inteligente para empresas",
  "start_url": "/app",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0F172A",
  "theme_color": "#0F172A",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**3. Atualizar `src/routes/__root.tsx`** — adicionar nos `links`/`meta` do head:
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- `<meta name="theme-color" content="#0F172A">`
- `<meta name="mobile-web-app-capable" content="yes">`

**Importante:** NÃO vou adicionar `vite-plugin-pwa` nem service worker — conforme as diretrizes do Lovable, isso quebra o preview em iframe. Manifest-only é suficiente para instalação e para gerar APK TWA.

## Etapa 2 — Publicar (você faz, 1 clique)

Clicar em **Publish** no canto superior direito. O manifest precisa estar acessível no domínio publicado (`https://ominibiz-suite.lovable.app/manifest.webmanifest`).

## Etapa 3 — Gerar o APK (você faz, sem código)

Opção mais fácil — **PWABuilder** (web, gratuito):

1. Acesse https://www.pwabuilder.com
2. Cole a URL: `https://ominibiz-suite.lovable.app`
3. Clique em **Start** → ele valida o manifest
4. Vá em **Package For Stores → Android**
5. Escolha **Test Package** (APK não assinado, para instalação interna) ou **Production** (gera keystore para Play Store no futuro)
6. Download do `.zip` contendo o `.apk`
7. Transfira para o Android → instale (habilitar "fontes desconhecidas")

Alternativa CLI: **Bubblewrap** (`npm i -g @bubblewrap/cli` → `bubblewrap init --manifest=...` → `bubblewrap build`). Requer Java JDK 17 + Android SDK localmente.

## Etapa 4 (opcional, depois) — Remover barra do navegador no TWA

Para o APK abrir sem a barra "executado por Chrome", publicar em `public/.well-known/assetlinks.json` o fingerprint SHA-256 da chave usada para assinar o APK (o PWABuilder fornece esse arquivo pronto após o build).

## Observações

- **Sem offline:** como combinado, não há service worker — o app precisa de internet (igual ao site).
- **APK interno:** o "Test Package" do PWABuilder já basta. Para Play Store no futuro, basta voltar e gerar versão assinada.
- **Ícones:** se você já tem logo/identidade definida, me avise para usar; senão gero a partir das cores do tema atual.

## Detalhes técnicos

Arquivos a criar/editar:
- `public/manifest.webmanifest` (novo)
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png` (novos)
- `src/routes/__root.tsx` (adicionar links/meta no `head()`)

Nenhuma dependência npm nova, nenhuma migration, nenhuma mudança de lógica/backend.
