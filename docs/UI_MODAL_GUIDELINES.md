# UI — GUIA PRÁTICO DE MODAIS (OmniBiz Suite)

Referência de arquitetura: `docs/ARCHITECTURE_MODAL_DESIGN_SYSTEM.md`.

## Receita padrão

```tsx
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader, ModalSection } from "@/components/ui/dialog";
import { UserCog } from "lucide-react";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">
    <ModalHeader
      icon={UserCog}
      title="Editar colaborador"
      description="Atualize os dados de identificação e acesso."
    />
    <ModalBody className="space-y-4">
      <form id="employee-form" onSubmit={onSubmit} className="space-y-4">
        <ModalSection title="Identificação">…</ModalSection>
        <ModalSection title="Organização e acesso">…</ModalSection>
      </form>
    </ModalBody>
    <ModalFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button type="submit" form="employee-form" disabled={saving}>
        {saving ? "A guardar…" : "Guardar alterações"}
      </Button>
    </ModalFooter>
  </DialogContent>
</Dialog>
```

## Com abas

```tsx
<DialogContent size="xl">
  <ModalHeader icon={Receipt} title="Recibo" description="Dados, valores e envio." />
  <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
    <ModalTabsBar>
      <TabsList>…</TabsList>
    </ModalTabsBar>
    <ModalBody className="space-y-4">
      <TabsContent value="dados">…</TabsContent>
    </ModalBody>
  </Tabs>
  <ModalFooter>…</ModalFooter>
</DialogContent>
```

## Checklist antes de fazer merge

- [ ] `ModalHeader` com ícone do módulo, título e subtítulo curto.
- [ ] Botão Fechar visível, 44×44 px, sem sobrepor texto.
- [ ] `ModalBody` é o único elemento com scroll.
- [ ] Ação principal no `ModalFooter` (nunca perdida no corpo rolável).
- [ ] Campos longos agrupados em `ModalSection`.
- [ ] Abas dentro de `ModalTabsBar`, conteúdo dentro do `ModalBody`.
- [ ] Testado em 1920×1080, 1366×768, 768×1024 e 390×844 — sem overflow horizontal.
- [ ] Nenhuma mudança em query/mutation/RPC/RBAC/RLS.

## Escolha de `size`

`sm` confirmação · `md` formulário curto (padrão) · `lg` formulário longo ·
`xl` editor denso, multi-abas ou pré-visualização de documento.
