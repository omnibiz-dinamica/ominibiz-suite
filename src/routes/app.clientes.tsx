import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTrigger, ModalHeader, ModalBody, ModalFooter, ModalSection } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Users,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Power,
  Trash2,
  FileSpreadsheet,
  FileDown,
  UserCog,
  CalendarDays,
  Clock,
} from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exports";
import { ClientGeoEditor, validateClientGeo, type ClientGeoValue } from "@/components/clientes/ClientGeoEditor";
import { invalidateClientsCache } from "@/lib/cache/clients";
import { parseHabitualSchedule, type ClientHabitualSchedule } from "@/lib/tasks/client-schedule";
import { calculateWallDurationMinutes, formatContractedMinutes, isOvernightTimeRange } from "@/lib/tasks/contracted-hours";
import { describeClientSchedule } from "@/lib/tasks/client-card";

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
  billing_mode: "hourly" | "fixed" | "mixed" | "monthly" | "daily";
  hourly_rate: number | null;
  fixed_rate: number | null;
  monthly_rate: number | null;
  daily_rate: number | null;
  contracted_minutes: number | null;

  timing_mode: "start_stop" | "manual";
  geo_lat: number | null;
  geo_lng: number | null;
  geo_address: string | null;
  geo_radius_m: number | null;
  habitual_schedule?: unknown;
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
      let q = (supabase.from("clients" as never) as any).select("*").order("name", { ascending: true });
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
      const { data, error } = await (supabase.from("client_assignees" as never) as any).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as AssigneeRow[];
    },
    enabled: !!user,
  });

  const { data: members } = useQuery({
    queryKey: ["members", currentCompanyId],
    queryFn: async () => {
      if (!currentCompanyId) return [];
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("company_id", currentCompanyId);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => invalidateClientsCache(qc))
      .on("postgres_changes", { event: "*", schema: "public", table: "client_assignees" }, () =>
        invalidateClientsCache(qc),
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
      const { error } = await (supabase.from("clients" as never) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      invalidateClientsCache(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assigneesByClient = (assignees ?? []).reduce<Record<string, AssigneeRow[]>>((acc, a) => {
    (acc[a.client_id] ||= []).push(a);
    return acc;
  }, {});
  const membersById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const BILLING_LABEL: Record<ClientRow["billing_mode"], string> = {
    hourly: "Por hora",
    fixed: "Valor fixo",
    mixed: "Misto",
    monthly: "Mensal",
    daily: "Por dia",
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
    {
      header: "Valor / dia",
      accessor: (c) => (c.daily_rate != null ? `€ ${Number(c.daily_rate).toFixed(2)}` : ""),
      width: 70,
    },
    {
      header: "Mensal",
      accessor: (c) => (c.monthly_rate != null ? `€ ${Number(c.monthly_rate).toFixed(2)}` : ""),
      width: 70,
    },
    {
      header: "Horas contratadas",
      accessor: (c) => formatContractedMinutes(c.contracted_minutes),
      width: 90,
    },

    {
      header: "Apontamento",
      accessor: () => "Start/Stop",
      width: 80,
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
            {isManager ? "Cadastre clientes e defina os funcionários responsáveis." : "Clientes em que você atende."}
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
              <DialogContent size="lg">
                <ModalHeader
                  icon={Users}
                  title={editing ? "Editar cliente" : "Novo cliente"}
                  description={editing ? "Atualize os dados do cliente." : "Registe um novo cliente e a sua equipa responsável."}
                />
                <ClientForm
                  companyId={currentCompanyId}
                  userId={user!.id}
                  initial={editing}
                  members={members ?? []}
                  assignees={editing ? (assigneesByClient[editing.id] ?? []) : []}
                  onDone={() => {
                    setOpen(false);
                    setEditing(null);
                    invalidateClientsCache(qc);
                  }}
                  onCancel={() => {
                    setOpen(false);
                    setEditing(null);
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
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{c.name}</h3>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        c.status === "ativo" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {isManager && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(c)}>
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
                  {describeClientSchedule(c).map((schedule, index) => (
                    <div key={`${schedule}-${index}`} className="flex items-center gap-1.5">
                      <CalendarDays className="h-3 w-3" /> {schedule}
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Carga contratada: {formatContractedMinutes(c.contracted_minutes) || "Não definida"}
                  </div>
                  {(c.address || c.geo_address) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {c.address || c.geo_address}
                    </div>
                  )}
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
                  {c.notes && <div className="line-clamp-2 pt-1 text-foreground/70">{c.notes}</div>}
                </div>

                {team.length > 0 && (
                  <div className="border-t border-border/60 pt-2">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Equipe</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {team.map((a) => (
                        <span
                          key={a.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                            a.is_primary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
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
  onCancel,
}: {
  companyId: string;
  userId: string;
  initial: ClientRow | null;
  members: Member[];
  assignees: AssigneeRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? initial?.geo_address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<"ativo" | "inativo">(initial?.status ?? "ativo");
  const timingMode: "start_stop" = "start_stop";
  const [billingMode, setBillingMode] = useState<ClientRow["billing_mode"]>(initial?.billing_mode ?? "hourly");
  const [hourlyRate, setHourlyRate] = useState<string>(initial?.hourly_rate != null ? String(initial.hourly_rate) : "");
  const [fixedRate, setFixedRate] = useState<string>(initial?.fixed_rate != null ? String(initial.fixed_rate) : "");
  const [monthlyRate, setMonthlyRate] = useState<string>(
    initial?.monthly_rate != null ? String(initial.monthly_rate) : "",
  );
  const [dailyRate, setDailyRate] = useState<string>(
    initial?.daily_rate != null ? String(initial.daily_rate) : "",
  );
  const existingSchedule = parseHabitualSchedule(initial?.habitual_schedule);
  const firstSchedule = existingSchedule[0];
  const [scheduleEnabled, setScheduleEnabled] = useState(existingSchedule.length > 0);
  const [scheduleWeekdays, setScheduleWeekdays] = useState<number[]>(firstSchedule?.weekdays ?? [1]);
  const [scheduleMode, setScheduleMode] = useState<ClientHabitualSchedule["mode"]>(firstSchedule?.mode ?? "fixed");
  const [scheduleStartTime, setScheduleStartTime] = useState(firstSchedule?.startTime ?? "");
  const [scheduleEndTime, setScheduleEndTime] = useState(firstSchedule?.endTime ?? "");
  const [contractedHours, setContractedHours] = useState(
    initial?.contracted_minutes != null ? String(Math.floor(initial.contracted_minutes / 60)) : "",
  );
  const [contractedRemainder, setContractedRemainder] = useState(
    initial?.contracted_minutes != null ? String(initial.contracted_minutes % 60) : "",
  );

  const [geo, setGeo] = useState<ClientGeoValue>({
    lat: initial?.geo_lat ?? null,
    lng: initial?.geo_lng ?? null,
    address: initial?.geo_address ?? initial?.address ?? null,
    radiusM: initial?.geo_radius_m ?? 50,
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assignees.map((a) => a.user_id)));
  const [primary, setPrimary] = useState<string>(() => assignees.find((a) => a.is_primary)?.user_id ?? "");
  const [loading, setLoading] = useState(false);

  const updateGeo = (next: ClientGeoValue) => {
    setGeo(next);
    if (next.address !== null && next.address !== address) setAddress(next.address);
  };

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
    <>
    <ModalBody>
    <form
      id="client-form"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const geoError = validateClientGeo(geo);
        if (geoError) {
          toast.error(geoError);
          return;
        }
        try {
          const parseRate = (s: string): number | null => {
            const n = Number(s.replace(",", "."));
            return Number.isFinite(n) && s.trim() !== "" ? n : null;
          };
          const parseWhole = (s: string): number | null => {
            if (s.trim() === "") return 0;
            const n = Number(s);
            return Number.isInteger(n) && n >= 0 ? n : null;
          };
          const hours = parseWhole(contractedHours);
          const remainder = parseWhole(contractedRemainder);
          if (hours == null || remainder == null || remainder > 59) {
            toast.error("Informe horas e minutos contratados válidos.");
            return;
          }
          const contractedMinutes = hours === 0 && remainder === 0 ? null : hours * 60 + remainder;
          if (contractedMinutes == null && (contractedHours.trim() !== "" || contractedRemainder.trim() !== "")) {
            toast.error("As horas totais contratadas devem ser maiores que zero.");
            return;
          }
          // Pacote V2 §6: os três valores do cliente são independentes e opcionais.
          // Nunca são apagados por causa da forma de cobrança selecionada.
          const rates = {
            hourly_rate: parseRate(hourlyRate),
            fixed_rate: parseRate(fixedRate),
            monthly_rate: parseRate(monthlyRate),
            daily_rate: parseRate(dailyRate),
          };
          if (scheduleEnabled && scheduleWeekdays.length === 0) {
            toast.error("Selecione pelo menos um dia para a programação habitual.");
            return;
          }
          if (scheduleEnabled && scheduleMode === "fixed" && (!scheduleStartTime || !scheduleEndTime)) {
            toast.error("Informe a hora de início e a hora de fim, ou escolha horário flexível.");
            return;
          }
          if (scheduleEnabled && scheduleMode === "fixed" && calculateWallDurationMinutes(scheduleStartTime, scheduleEndTime) == null) {
            toast.error("Informe horários diferentes e válidos para início e fim.");
            return;
          }
          const habitualSchedule = scheduleEnabled
            ? [
                {
                  weekdays: [...scheduleWeekdays].sort((a, b) => a - b),
                  mode: scheduleMode,
                  start_time: scheduleMode === "fixed" ? scheduleStartTime : null,
                  end_time: scheduleMode === "fixed" ? scheduleEndTime : null,
                },
              ]
            : [];

          setLoading(true);
          let clientId = initial?.id;
          if (initial) {
            const { error } = await (supabase.from("clients" as never) as any)
              .update({
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                notes: notes.trim() || null,
                status,
                timing_mode: timingMode,
                billing_mode: billingMode,
                ...rates,
                contracted_minutes: contractedMinutes,
                geo_lat: geo.lat,
                geo_lng: geo.lng,
                geo_address: address.trim() || null,
                geo_radius_m: geo.lat != null ? geo.radiusM : null,
                habitual_schedule: habitualSchedule,
              })
              .eq("id", initial.id);
            if (error) throw error;
          } else {
            const { data, error } = await (supabase.from("clients" as never) as any)
              .insert({
                company_id: companyId,
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                notes: notes.trim() || null,
                status,
                created_by: userId,
                timing_mode: timingMode,
                billing_mode: billingMode,
                ...rates,
                contracted_minutes: contractedMinutes,
                geo_lat: geo.lat,
                geo_lng: geo.lng,
                geo_address: address.trim() || null,
                geo_radius_m: geo.lat != null ? geo.radiusM : null,
                habitual_schedule: habitualSchedule,
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
              await (supabase.from("client_assignees" as never) as any).delete().in(
                "id",
                toRemove.map((a) => a.id),
              );
            }
            // Adiciona novos
            const existing = new Set(assignees.map((a) => a.user_id));
            const toAdd = [...selected].filter((u) => !existing.has(u));
            if (toAdd.length > 0) {
              await (supabase.from("client_assignees" as never) as any).insert(
                toAdd.map((u) => ({
                  company_id: companyId,
                  client_id: clientId,
                  user_id: u,
                  is_primary: u === primary,
                })),
              );
            }
            // Atualiza primário
            await (supabase.from("client_assignees" as never) as any)
              .update({ is_primary: false })
              .eq("client_id", clientId);
            if (primary && selected.has(primary)) {
              await (supabase.from("client_assignees" as never) as any)
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
      <ModalSection title="Dados do cliente" icon={Users}>
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
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
      </ModalSection>

      <ModalSection title="Contacto" icon={Mail}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" maxLength={150} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      </ModalSection>

      <ModalSection
        title="Programação habitual"
        description="Usada como sugestão ao criar tarefas para este cliente."
        icon={CalendarDays}
      >
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium">Usar horário habitual</p>
            <p className="text-xs text-muted-foreground">
              A tarefa receberá a próxima data e o horário configurado, sem impedir ajustes manuais.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scheduleEnabled}
            onClick={() => setScheduleEnabled((value) => !value)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${scheduleEnabled ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-background shadow transition ${scheduleEnabled ? "left-6" : "left-1"}`}
            />
          </button>
        </div>

        {scheduleEnabled && (
          <>
            <div className="space-y-1.5">
              <Label>Dias habituais</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((label, day) => {
                  const active = scheduleWeekdays.includes(day);
                  return (
                    <button
                      key={`${label}-${day}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setScheduleWeekdays((current) =>
                          active ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
                        )
                      }
                      className={`h-9 rounded-md border text-sm font-medium ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">D = domingo; S = segunda-feira e sábado.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de horário</Label>
              <Select value={scheduleMode} onValueChange={(value) => setScheduleMode(value as typeof scheduleMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Horário fixo</SelectItem>
                  <SelectItem value="flexible">Horário flexível</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scheduleMode === "fixed" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora de início</Label>
                  <Input type="time" value={scheduleStartTime} onChange={(e) => setScheduleStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora de fim</Label>
                  <Input type="time" value={scheduleEndTime} onChange={(e) => setScheduleEndTime(e.target.value)} />
                  {isOvernightTimeRange(scheduleStartTime, scheduleEndTime) && (
                    <p className="text-xs text-muted-foreground">O fim será considerado no dia seguinte (+1 dia).</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                A data será sugerida pelos dias selecionados. O funcionário registrará o horário no início e no fim.
              </p>
            )}
          </>
        )}
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
          <Label>Horas totais contratadas</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Horas</Label>
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={contractedHours}
                onChange={(e) => setContractedHours(e.target.value)}
                placeholder="3"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Minutos</Label>
              <Input
                type="number"
                min="0"
                max="59"
                step="1"
                inputMode="numeric"
                value={contractedRemainder}
                onChange={(e) => setContractedRemainder(e.target.value)}
                placeholder="00"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Carga total do serviço, distribuída entre os funcionários selecionados na tarefa. Não altera cobrança nem horas efetivas.
          </p>
        </div>
      </ModalSection>

      <ModalSection title="Cobrança" icon={FileSpreadsheet}>
        <div className="space-y-1.5">
          <Label>Forma de cobrança</Label>
          <Select value={billingMode} onValueChange={(v) => setBillingMode(v as ClientRow["billing_mode"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Por hora</SelectItem>
              <SelectItem value="daily">Por dia</SelectItem>
              <SelectItem value="fixed">Valor fixo por tarefa</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="mixed">Misto (hora + fixo)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Valor / hora (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="Herda da empresa"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor / dia (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              placeholder="Herda da empresa"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor mensal (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(e.target.value)}
              placeholder="Herda da empresa"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor fixo por tarefa (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={fixedRate}
              onChange={(e) => setFixedRate(e.target.value)}
              placeholder="Herda da empresa"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Todos os valores são opcionais e independentes. Em branco, herda o valor padrão da
          empresa. A modalidade aplicada ao pagamento é sempre a do funcionário
          (Funcionário &gt; Cliente &gt; Empresa).
        </p>
      </ModalSection>

      <ModalSection title="Endereço e geolocalização" icon={MapPin}>
        <div className="space-y-1.5">
          <Label>Endereço do cliente</Label>
          <Input
            maxLength={250}
            value={address}
            onChange={(e) => {
              const nextAddress = e.target.value;
              setAddress(nextAddress);
              setGeo((current) => ({ ...current, address: nextAddress }));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Modo de apontamento</Label>
          <div className="flex gap-2">
            {([{ v: "start_stop", label: "Start/Stop", hint: "Funcionário marca início e fim" }] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => undefined}
                className={`flex-1 rounded-lg border p-2 text-left text-xs transition ${
                  timingMode === opt.v ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <ClientGeoEditor value={geo} onChange={updateGeo} showAddressField={false} />
      </ModalSection>

      {members.length > 0 && (
        <ModalSection title="Equipa responsável" icon={UserCog}>
          <div className="space-y-1 rounded-lg border border-border p-2">
            {members.map((m) => {
              const checked = selected.has(m.id);
              return (
                <label key={m.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent">
                  <span className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggleMember(m.id)} />
                    {m.full_name ?? m.id.slice(0, 8)}
                  </span>
                  {checked && (
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input type="radio" name="primary" checked={primary === m.id} onChange={() => setPrimary(m.id)} />
                      principal
                    </label>
                  )}
                </label>
              );
            })}
          </div>
        </ModalSection>
      )}
    </form>
    </ModalBody>
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" form="client-form" disabled={loading}>
        {loading ? "Salvando..." : initial ? "Salvar alterações" : "Criar cliente"}
      </Button>
    </ModalFooter>
    </>
  );
}
