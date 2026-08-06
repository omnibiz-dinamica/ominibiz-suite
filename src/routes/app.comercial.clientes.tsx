import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTrigger, ModalHeader, ModalBody, ModalFooter, ModalSection } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMERCIAL_STATUS_LABEL } from "@/lib/contract-vars";
import { Plus, Pencil, Trash2, Building2, Mail, MapPin } from "lucide-react";

export const Route = createFileRoute("/app/comercial/clientes")({
  component: ClientsPage,
});

type ClientRow = {
  id: string;
  company_name: string;
  legal_name: string | null;
  nif: string | null;
  tax_id_kind: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  status: string;
  notes: string | null;
};

const empty = {
  id: "" as string,
  company_name: "",
  legal_name: "",
  nif: "",
  tax_id_kind: "nif",
  email: "",
  phone: "",
  contact_name: "",
  address: "",
  city: "",
  state: "",
  country: "PT",
  website: "",
  status: "lead",
  notes: "",
};

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["commercial_clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_name.trim()) throw new Error("Nome obrigatório");
      const payload = {
        company_name: form.company_name.trim(),
        legal_name: form.legal_name || null,
        nif: form.nif || null,
        tax_id_kind: form.tax_id_kind || null,
        email: form.email || null,
        phone: form.phone || null,
        contact_name: form.contact_name || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || null,
        website: form.website || null,
        status: form.status as never,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("commercial_clients").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("commercial_clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Cliente atualizado" : "Cliente criado");
      qc.invalidateQueries({ queryKey: ["commercial_clients"] });
      setOpen(false);
      setForm({ ...empty });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commercial_clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["commercial_clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setForm({ ...empty }); setOpen(true); };
  const openEdit = (c: ClientRow) => {
    setForm({
      id: c.id,
      company_name: c.company_name,
      legal_name: c.legal_name ?? "",
      nif: c.nif ?? "",
      tax_id_kind: c.tax_id_kind ?? "nif",
      email: c.email ?? "",
      phone: c.phone ?? "",
      contact_name: c.contact_name ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      country: c.country ?? "PT",
      website: c.website ?? "",
      status: c.status ?? "lead",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Clientes comerciais</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent size="lg">
            <ModalHeader
              icon={Building2}
              title={form.id ? "Editar cliente" : "Novo cliente"}
              description={form.id ? "Atualize os dados do cliente comercial." : "Preencha os dados para registar um novo cliente comercial."}
            />
            <ModalBody className="space-y-4">
              <ModalSection title="Dados do cliente" icon={Building2}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Nome comercial *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
                  <div><Label>Razão social</Label><Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
                  <div><Label>Tipo de documento</Label>
                    <Select value={form.tax_id_kind} onValueChange={(v) => setForm({ ...form, tax_id_kind: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nif">NIF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Número do documento</Label><Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} /></div>
                  <div><Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(COMMERCIAL_STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2"><Label>Notas</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                </div>
              </ModalSection>

              <ModalSection title="Contacto" icon={Mail}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Contacto</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
                </div>
              </ModalSection>

              <ModalSection title="Endereço e geolocalização" icon={MapPin}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>Estado / Distrito</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                  <div><Label>País</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
                </div>
              </ModalSection>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
            </ModalFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum cliente ainda. Crie o primeiro.</div>
        ) : (
          <ul className="divide-y divide-border">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.company_name}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {COMMERCIAL_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.nif ? `NIF ${c.nif} · ` : ""}{c.email ?? "—"} · {c.phone ?? "—"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (confirm(`Remover ${c.company_name}?`)) remove.mutate(c.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}