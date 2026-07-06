# Geofencing — Guia UX & Conceitual (Item 17)

> **Fase:** 1 · **Data:** 2026-07-06 · **Público:** Gestores, Super Admins, Product

## 1. O que é Geofencing no OmniBiz?

É a validação automática de que o funcionário está fisicamente **no local do cliente** ao iniciar ou encerrar uma tarefa. O sistema compara a posição GPS do dispositivo com o "círculo" cadastrado no cliente. Se estiver dentro → operação segue normalmente. Se fora → aplica a política configurada (`alert`, `justify` ou `block`).

## 2. Anatomia do cadastro

No editor de cliente, você configura 5 elementos:

### 2.1 Latitude e Longitude

- **O que são:** as coordenadas GPS do ponto central do local (referencial WGS84, o mesmo do Google Maps).
- **De onde vêm:** você as define clicando no mapa ou buscando o endereço.
- **Precisão típica:** 6 casas decimais = ~11 cm. Não é necessário refinar mais que isso.
- **Não confunda com:** endereço postal (que é humano) — o cálculo usa somente lat/lng.

### 2.2 Endereço

- **O que é:** rótulo humano do local (ex.: "Rua das Flores, 123 — Lisboa").
- **Uso:** exibição em telas, relatórios e emails.
- **Não é usado no cálculo de geofencing.**

### 2.3 Raio (metros)

- **O que é:** distância a partir do ponto central dentro da qual o funcionário é considerado "no local".
- **Padrões sugeridos:**
  - Loja urbana pequena: **50 m**
  - Escritório médio: **100 m**
  - Complexo/condomínio: **200 m**
  - Obra/canteiro: **250 m**
  - Fazenda/site industrial: **500 m** ou mais
- **Regra prática:** o raio deve cobrir todo o local sem invadir vizinhos.

### 2.4 Precisão do dispositivo (leitura em tempo real)

- **O que é:** erro estimado da leitura GPS do celular do funcionário, em metros. Reportado pelo próprio navegador/OS.
- **Independente do raio cadastrado.** O raio é sua regra; a precisão é a qualidade da leitura naquele momento.
- **Classificação visual:**
  - 🟢 Excelente (≤ 15m) — ideal
  - 🟡 Boa (≤ 40m) — adequada
  - 🟠 Baixa (≤ 80m) — funciona, mas atenção
  - 🔴 Muito baixa (> 80m) — pode gerar rejeição indevida

### 2.5 Slider

- **O que é:** controle rápido para ajustar o raio sem digitar.
- **UX proposta na Fase 5:** substituir por **presets** (Loja / Escritório / Condomínio / Obra / Fazenda) + slider avançado para fine-tuning. Mais rápido para 90% dos casos.

## 3. Como o cálculo funciona

```
distância = haversine(lat_funcionario, lng_funcionario, lat_cliente, lng_cliente)

se distância ≤ raio_cliente:
    dentro do local ✅
senão:
    fora do raio ❌ → aplica política (alert/justify/block)
```

A função `haversine_m` já está no banco de dados.

## 4. E se a precisão for ruim?

Exemplo prático: raio = 100 m, precisão = 60 m.

- Se o funcionário reporta 80m de distância → **pode estar entre 20m e 140m do centro**. O sistema classifica como "dentro" (80 ≤ 100) mas com incerteza.
- Boa prática: quando `accuracy > raio × 0.5`, exibir aviso ao gestor para revisão.

A **Fase 6** introduz refinamento progressivo para mitigar isso.

## 5. Políticas configuráveis (por empresa)

Em `Empresa → Recursos Humanos → Geolocalização`:

| Cenário | Opções |
|---|---|
| Funcionário **fora do raio** ao iniciar | `alert` (só avisa) · `justify` (exige motivo) · `block` (não deixa iniciar) |
| Funcionário **fora do raio** ao encerrar | mesmas 3 opções, independentes |
| **Sem GPS** ao iniciar / encerrar | mesmas 3 opções, independentes |

## 6. Quando NÃO usar Geofencing

- Clientes com `operational_profile = manual_only` (ex.: COIFA — Fase 5) desativam o fluxo automático e o funcionário registra manualmente.
- Empresas com serviços 100% remotos podem desligar `geo_required_start` e `geo_required_stop`.

## 7. UX melhor proposta (Fase 5)

No editor de cliente, substituir formulário atual por:

```
┌────────────────────────────────────────┐
│  Local do trabalho                     │
│                                        │
│  [ Buscar endereço... ]                │
│  ou clique no mapa 👇                  │
│                                        │
│  ┌───────── MAPA COM PIN ─────────┐    │
│  │                                 │   │
│  │   ◉  ← círculo do raio         │    │
│  └────────────────────────────────┘    │
│                                        │
│  Tipo do local:                        │
│  ⚪ Loja (50m)                          │
│  ⚪ Escritório (100m)                   │
│  ⚫ Condomínio (200m)                   │
│  ⚪ Obra (250m)                         │
│  ⚪ Fazenda (500m)                      │
│  ⚪ Personalizado: [slider]  200m      │
└────────────────────────────────────────┘
```

Reduz o erro de configuração em ~80% segundo estimativa qualitativa.

## 8. Perguntas frequentes

**P:** Posso mudar o raio depois?
**R:** Sim, a qualquer momento. Aplica-se a novas operações.

**P:** O funcionário sabe que estou monitorando?
**R:** Sim. Cada operação mostra o status GPS (badge colorido) e a política ativa.

**P:** LGPD?
**R:** Coleta de localização apenas no momento da operação de ponto. Sem tracking contínuo. Retenção auditada em `time_entry_geopoints`.

---

**Documento vivo.** Atualizar conforme UX evoluir.