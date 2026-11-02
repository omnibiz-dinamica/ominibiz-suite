import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveContact, setContactTags } from "@/lib/messages/api";
import { normalizePhone } from "@/lib/messages/phone";
import type { MsgContact, MsgTag } from "@/lib/messages/types";

export function ContactDialog({
  companyId,
  contact,
  tags,
  currentTagIds,
  onClose,
  onSaved,
}: {
  companyId: string;
  contact: MsgContact | null;
  tags: MsgTag[];
  currentTagIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [optedIn, setOptedIn] = useState(contact?.opted_in ?? true);
  const [active, setActive] = useState((contact?.status ?? "ativo") === "ativo");
  const [tagIds, setTagIds] = useState<string[]>(currentTagIds);

  const phoneCheck = normalizePhone(phone);
  const emailInvalid = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = !!name.trim() && phoneCheck.ok && !emailInvalid;

  const save = useMutation({
    mutationFn: async () => {
      if (!phoneCheck.ok) throw new Error(phoneCheck.error);
      const id = await saveContact(companyId, contact?.id ?? null, {
        name,
        phone: phoneCheck.phone,
        email: email || null,
        opted_in: optedIn,
        status: active ? "ativo" : "inativo",
      });
      await setContactTags(companyId, id, contact ? currentTagIds : [], tagIds);
    },
    onSuccess: () => {
      toast.success(contact ? "Contato atualizado." : "Contato criado.");
      onSaved();
      onClose();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      onSaved();
    },
  });

  const toggleTag = (id: string, on: boolean) =>
    setTagIds((prev) => (on ? [...prev, id] : prev.filter((t) => t !== id)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar contato" : "Novo contato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="msg-c-name">Nome</Label>
            <Input
              id="msg-c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-c-phone">Telefone (com código do país)</Label>
            <Input
              id="msg-c-phone"
              inputMode="tel"
              placeholder="+351912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {!phoneCheck.ok ? <p className="text-xs text-destructive">{phoneCheck.error}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-c-email">E-mail</Label>
            <Input
              id="msg-c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailInvalid ? <p className="text-xs text-destructive">E-mail inválido.</p> : null}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="msg-c-opt">Aceita receber mensagens</Label>
            <Switch id="msg-c-opt" checked={optedIn} onCheckedChange={setOptedIn} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="msg-c-active">Contato ativo</Label>
            <Switch id="msg-c-active" checked={active} onCheckedChange={setActive} />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ainda não há tags. Crie-as na aba Tags e Campos.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {tags.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={tagIds.includes(t.id)}
                      onCheckedChange={(v) => toggleTag(t.id, v === true)}
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
