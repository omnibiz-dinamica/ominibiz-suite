# ARQUITETURA — MODAL DESIGN SYSTEM (OmniBiz Suite)

Status: ativo · Versão 1.0 · Escopo: **interface apenas**

## 1. Objetivo

Padronizar todos os modais, dialogs, sheets e drawers do sistema num único
padrão visual, moderno e responsivo, sem qualquer alteração de banco de dados,
schema, RBAC, RLS, permissões, queries, mutations, RPCs, uploads ou regras de
negócio.

## 2. Componentes canónicos

Definidos em `src/components/ui/dialog.tsx` e re-exportados por
`src/components/ui/sheet.tsx` e `src/components/ui/drawer.tsx`:

| Componente      | Papel |
| --------------- | ----- |
| `ModalHeader`   | Cabeçalho fixo: `icon` (ícone do módulo), `title`, `description` (subtítulo curto). Padding `pr-16` reservado para o botão Fechar. |
| `ModalTabsBar`  | Faixa de abas imediatamente abaixo do header, com scroll horizontal controlado no mobile. |
| `ModalBody`     | **Única** região rolável do modal (`flex-1 min-h-0 overflow-y-auto`). |
| `ModalFooter`   | Barra de ações fixa: borda superior, fundo `background`, respeita `safe-area-inset-bottom`. |
| `ModalSection`  | Card interno para agrupar campos (`title`, `description`, `icon`, `actions`). |

Aliases de compatibilidade: `DialogHeader`, `SheetHeader`, `DrawerHeader` →
`ModalHeader`; `DialogFooter`, `SheetFooter`, `DrawerFooter` → `ModalFooter`.

## 3. Shell (`DialogContent` / `SheetContent` / `DrawerContent`)

`DialogContent` é um shell `flex flex-col overflow-hidden` **sem padding e sem
scroll próprio** — o scroll pertence exclusivamente ao `ModalBody`, o que
elimina scroll duplo e overflow horizontal.

Prop `size` (largura máxima a partir de `sm`):

| size | Largura | Uso |
| ---- | ------- | --- |
| `sm` | `max-w-md` | confirmações, formulários de 1–3 campos |
| `md` | `max-w-2xl` | formulários curtos (padrão) |
| `lg` | `max-w-4xl` | formulários longos |
| `xl` | `min(1200px, 94vw)` | editores densos, multi-abas, pré-visualização de documentos |

Dimensões por breakpoint:

| Dispositivo | Largura | Altura máx. | Raio |
| ----------- | ------- | ----------- | ---- |
| Mobile (`<sm`) | `100vw` | `100dvh` (full-screen) | 0 |
| Tablet (`sm`) | `96vw` | `94vh` | `rounded-2xl` |
| Notebook (`md`) | `96vw` | `92vh` | `rounded-2xl` |
| Desktop (`lg`) | `min(1200px, 94vw)` com `size="xl"` | `90vh` | `rounded-2xl` |

## 4. Botão Fechar

Renderizado pelo próprio `DialogContent`/`SheetContent`/`DrawerContent`:
`absolute right-3 top-3`, `z-50`, `h-11 w-11` (44×44 px), `rounded-full`,
`aria-label="Fechar"` + `sr-only` "Fechar". Nunca é sobreposto pelo título
(header usa `pr-16`) nem pelas abas.

`hideClose` está disponível apenas para modais que renderizam o seu próprio
controlo de fecho.

## 5. Estrutura obrigatória

```text
DialogContent size=…
├── ModalHeader   (ícone · título · subtítulo · Fechar)
├── ModalTabsBar  (opcional — TabsList)
├── ModalBody     (scroll · ModalSection / cards)
└── ModalFooter   ([Cancelar]            [Ação principal])
```

Quando o formulário vive dentro do `ModalBody`, o botão principal no footer usa
`type="submit" form="<id>"` — a mutation permanece inalterada.

## 6. Invariantes

1. `ModalBody` é a única área rolável.
2. Ações principais (Guardar, Criar, Confirmar, Excluir) vivem no `ModalFooter`.
   Ações de item interno (upload/download/anexo) permanecem no corpo.
3. Formulários longos são agrupados em `ModalSection`.
4. Sem utilitários de cor hardcoded — apenas tokens semânticos.
5. Sem overflow horizontal: `min-w-0`, `truncate`, grids `grid-cols-1 sm:grid-cols-2`.
6. `AlertDialog` mantém primitivos próprios (confirmações), alinhados ao mesmo
   shell (raio, borda, header/footer fixos, corpo rolável).

## 7. Garantias desta migração

Alteração **exclusivamente visual/estrutural (JSX + classNames)**. Não foram
alterados: banco de dados, schema, RBAC, RLS, políticas, permissões, queries,
mutations, RPCs, uploads nem fluxos funcionais.
