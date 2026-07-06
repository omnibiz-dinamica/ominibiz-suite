import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, Phone, Mail, MapPin, Pencil, Power, Trash2, FileSpreadsheet, FileDown } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exports";
import { ClientGeoEditor, validateClientGeo, type ClientGeoValue } from "@/components/clientes/ClientGeoEditor";
import { invalidateClientsCache } from "@/lib/cache/clients";

export const Route = createFileRoute("/app/clientes")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <ClientsPage />
    </RoleGuard>
  ),
});

interface ClientRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
  created_at: string;
  billing_mode: "hourly" | "fixed" | "mixed";
  hourly_rate: number | null;
  fixed_rate: number | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_address: string | null;
  geo_radius_m: number | null;
}

interface AssigneeRow {
  id: string;
  client_id: string;
  user_id: string;
  is_primary: boolean;
}

interface Member {
  id: string;
  full_name: string | null;
}

function ClientsPage() {
  const { user, isManager, currentCompanyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", currentCompanyId, isManager, user?.id],
    queryFn: async () => {
      let q = (supabase.from("clients" as never) as any)
        .select("*")
        .order("name", { ascending: true });
      if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ClientRow[];
    },
    enabled: !!user,
  });

  const { data: assignees } = useQuery({
    queryKey: ["client-assignees", currentCompanyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_assignees" as never) as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as AssigneeRow[];
    },
    enabled: !!user,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      return (profs ?? []) as Member[];
    },
    enabled: isManager && !!currentCompanyId,
  });

  const { data: company } = useQuery({
    queryKey: ["company-branding", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, primary_color")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`user:${user.id}:clients-ui-sync`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        () => invalidateClientsCache(qc),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_assignees" },
        () => invalidateClientsCache(qc),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const toggleStatus = useMutation({
    mutationFn: async (c: ClientRow) => {
      const { error } = await (supabase.from("clients" as never) as any)
        .update({ status: c.status === "ativo" ? "inativo" : "ativo" })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      invalidateClientsCache(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("clients" as never) as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      invalidateClientsCache(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assigneesByClient = (assignees ?? []).reduce<Record<string, AssigneeRow[]>>(
    (acc, a) => {
      (acc[a.client_id] ||= []).push(a);
      return acc;
    },
    {},
  );
  const membersById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const BILLING_LABEL: Record<ClientRow["billing_mode"], string> = {
    hourly: "Por hora",
    fixed: "Valor fixo",
    mixed: "Misto",
  };

  const buildExportColumns = (): ExportColumn<ClientRow>[] => [
    { header: "Nome", accessor: (c) => c.name, width: 140 },
    {
      header: "Contacto",
      accessor: (c) => {
        const team = assigneesByClient[c.id] ?? [];
        const primary = team.find((a) => a.is_primary) ?? team[0];
        return primary ? (membersById.get(primary.user_id) ?? "") : "";
      },
      width: 120,
    },
    { header: "Email", accessor: (c) => c.email ?? "", width: 140 },
    { header: "Telefone", accessor: (c) => c.phone ?? "", width: 100 },
    { header: "Morada", accessor: (c) => c.address ?? "", width: 180 },
    { header: "Tipo de cobrança", accessor: (c) => BILLING_LABEL[c.billing_mode] ?? c.billing_mode, width: 90 },
    {
      header: "Valor fixo",
      accessor: (c) => (c.fixed_rate != null ? `€ ${Number(c.fixed_rate).toFixed(2)}` : ""),
      width: 70,
    },
    {
      header: "Valor / hora",
      accessor: (c) => (c.hourly_rate != null ? `€ ${Number(c.hourly_rate).toFixed(2)}` : ""),
      width: 70,
    },
    { header: "Status", accessor: (c) => c.status, width: 60 },
  ];

  const handleExport = (kind: "xlsx" | "pdf") => {
    const list = clients ?? [];
    if (list.length === 0) {
      toast.info("Nenhum cliente para exportar.");
      return;
    }
    const meta = {
      fileName: `clientes-${new Date().toISOString().slice(0, 10)}`,
      title: "Clientes",
      companyName: company?.name ?? null,
      primaryColor: (company as { primary_color?: string | null } | null | undefined)?.primary_color ?? null,
      subtitle: `${list.length} cliente(s) — ativos e inativos`,
    };
    if (kind === "xlsx") exportToExcel(list, buildExportColumns(), meta);
    else exportToPdf(list, buildExportColumns(), meta);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-muted-foreground">
            {isManager
              ? "Cadastre clientes e defina os funcionários responsáveis."
              : "Clientes em que você atende."}
          </p>
        </div>
        {isManager && currentCompanyId && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
              <FileDown className="mr-2 h-4 w-4" /> Exportar PDF
            </Button>
            <Dialog
            open={open || !!editing}
            onOpenChange={(v) => {
              if (!v) {
                setOpen(false);
                setEditing(null);
              } else {
                setOpen(true);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="mr-2 h-4 w-4" /> Novo cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
              </DialogHeader>
              <ClientForm
                companyId={currentCompanyId}
                userId={user!.id}
                initial={editing}
                members={members ?? []}
                assignees={editing ? assigneesByClient[editing.id] ?? [] : []}
                onDone={() => {
                  setOpen(false);
                  setEditing(null);
                  invalidateClientsCache(qc);
                }}
              />
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : (clients ?? []).length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold">Nenhum cliente cadastrado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isManager
              ? "Cadastre o primeiro cliente para começar a operação."
              : "Você ainda não foi vinculado a nenhum cliente."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(clients ?? []).map((c) => {
            const team = assigneesByClient[c.id] ?? [];
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{c.name}</h3>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        c.status === "ativo"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {isManager && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={c.status === "ativo" ? "Inativar" : "Ativar"}
                        onClick={() => toggleStatus.mutate(c)}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remover"
                        onClick={() => {
                          if (confirm(`Remover "${c.name}"?`)) remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {c.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> {c.email}
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {c.address}
                    </div>
                  )}
                  {c.notes && (
                    <div className="line-clamp-2 pt-1 text-foreground/70">{c.notes}</div>
                  )}
                </div>

                {team.length > 0 && (
                  <div className="border-t border-border/60 pt-2">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Equipe
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {team.map((a) => (
                        <span
                          key={a.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                            a.is_primary
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {a.is_primary && "★ "}
                          {membersById.get(a.user_id) ?? a.user_id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClientForm({
  companyId,
  userId,
  initial,
  members,
  assignees,
  onDone,
}: {
  companyId: string;
  userId: string;
  initial: ClientRow | null;
  members: Member[];
  assignees: AssigneeRow[];
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<"ativo" | "inativo">(initial?.status ?? "ativo");
  const [geo, setGeo] = useState<ClientGeoValue>({
    lat: initial?.geo_lat ?? null,
    lng: initial?.geo_lng ?? null,
    address: initial?.geo_address ?? null,
    radiusM: initial?.geo_radius_m ?? 50,
  });
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(assignees.map((a) => a.user_id)),
  );
  const [primary, setPrimary] = useState<string>(
    () => assignees.find((a) => a.is_primary)?.user_id ?? "",
  );
  const [loading, setLoading] = useState(false);

  const toggleMember = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        n.delete(id);
        if (primary === id) setPrimary("");
      } else {
        n.add(id);
      }
      return n;
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const geoError = validateClientGeo(geo);
        if (geoError) {
          toast.error(geoError);
          return;
        }
        setLoading(true);
        try {
          let clientId = initial?.id;
          if (initial) {
            const { error } = await (
              supabase.from("clients" as never) as any
            )
              .update({
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                notes: notes.trim() || null,
                status,
                geo_lat: geo.lat,
                geo_lng: geo.lng,
                geo_address: geo.address?.trim() || null,
                geo_radius_m: geo.lat != null ? geo.radiusM : null,
              })
              .eq("id", initial.id);
            if (error) throw error;
          } else {
            const { data, error } = await (
              supabase.from("clients" as never) as any
            )
              .insert({
                company_id: companyId,
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                notes: notes.trim() || null,
                status,
                created_by: userId,
                geo_lat: geo.lat,
                geo_lng: geo.lng,
                geo_address: geo.address?.trim() || null,
                geo_radius_m: geo.lat != null ? geo.radiusM : null,
              })
              .select("id")
              .single();
            if (error) throw error;
            clientId = (data as { id: string }).id;
          }

          // Sincroniza vínculos
          if (clientId) {
            // Remove os desmarcados
            const toRemove = assignees.filter((a) => !selected.has(a.user_id));
            if (toRemove.length > 0) {
              await (
                supabase.from("client_assignees" as never) as any
              )
                .delete()
                .in(
                  "id",
                  toRemove.map((a) => a.id),
                );
            }
            // Adiciona novos
            const existing = new Set(assignees.map((a) => a.user_id));
            const toAdd = [...selected].filter((u) => !existing.has(u));
            if (toAdd.length > 0) {
              await (
                supabase.from("client_assignees" as never) as any
              ).insert(
                toAdd.map((u) => ({
                  company_id: companyId,
                  client_id: clientId,
                  user_id: u,
                  is_primary: u === primary,
                })),
              );
            }
            // Atualiza primário
            await (
              supabase.from("client_assignees" as never) as any
            )
              .update({ is_primary: false })
              .eq("client_id", clientId);
            if (primary && selected.has(primary)) {
              await (
                supabase.from("client_assignees" as never) as any
              )
                .update({ is_primary: true })
                .eq("client_id", clientId)
                .eq("user_id", primary);
            }
          }

          toast.success(initial ? "Cliente atualizado" : "Cliente criado");
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            maxLength={150}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Endereço</Label>
        <Input maxLength={250} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ClientGeoEditor value={geo} onChange={setGeo} />

      {members.length > 0 && (
        <div className="space-y-2">
          <Label>Equipe responsável</Label>
          <div className="space-y-1 rounded-lg border border-border p-2">
            {members.map((m) => {
              const checked = selected.has(m.id);
              return (
                <label
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(m.id)}
                    />
                    {m.full_name ?? m.id.slice(0, 8)}
                  </span>
                  {checked && (
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="radio"
                        name="primary"
                        checked={primary === m.id}
                        onChange={() => setPrimary(m.id)}
                      />
                      principal
                    </label>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar cliente"}
      </Button>
    </form>
  );
}
