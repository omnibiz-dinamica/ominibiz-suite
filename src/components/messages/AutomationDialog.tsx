import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createAutomationDraft, updateAutomation } from "@/lib/messages/api";
import type { MsgAutomation } from "@/lib/messages/types";

/** Criar rascunho ou renomear/mudar de pasta. O editor de fluxos vem numa etapa seguinte. */
export function AutomationDialog({
  companyId,
  target,
  folders,
  onClose,
  onSaved,
}: {
  companyId: string;
  target: MsgAutomation | "new";
  folders: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === "new";
  const current = target !== "new" ? target : null;
  const [name, setName] = useState(current?.name ?? "");
  const [folder, setFolder] = useState(current?.folder ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) await createAutomationDraft(companyId, name, folder || null);
      else if (current)
        await updateAutomation(companyId, current.id, {
          name: name.trim(),
          folder: folder.trim() || null,
        });
    },
    onSuccess: () => {
      toast.success(
        isNew ? "Rascunho criado. Editor disponível em breve." : "Automação atualizada.",
      );
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova automação" : "Editar automação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="msg-auto-name">Nome</Label>
            <Input
              id="msg-auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-auto-folder">Pasta (opcional)</Label>
            <Input
              id="msg-auto-folder"
              list="msg-auto-folders"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              maxLength={60}
            />
            <datalist id="msg-auto-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          {isNew ? (
            <p className="text-xs text-muted-foreground">
              A automação é criada como rascunho. O editor de fluxos estará disponível em breve.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
