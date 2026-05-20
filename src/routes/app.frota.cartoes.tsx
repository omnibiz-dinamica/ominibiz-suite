import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, Plus, ArrowLeft, X } from "lucide-react";

export const Route = createFileRoute("/app/frota/cartoes")({ component: CardsPage });

type FuelCard = {
  id: string; number: string; label: string | null; photo_path: string | null;
  status: "ativo" | "inativo"; company_id: string;
};
type Vehicle = { id: string; plate: string; brand: string | null; model: string | null };
type Member = { id: string; name: string };
type CardVehicle = { id: string; card_id: string; vehicle_id: string };
type CardUser = { id: string; card_id: string; user_id: string };

async function uploadFleetPhoto(companyId: string, kind: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${companyId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("fleet").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

function SignedImg({ path, className }: { path: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let alive = true;
    supabase.storage.from("fleet").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [path]);
  if (!path) return null;
  return url ? <img src={url} alt="" className={className} /> : <div className={(className ?? "") + " bg-muted"} />;
}

function CardsPage() {
  const { currentCompanyId, isManager } = useAuth();
  const qc = useQueryClient();

  const { data: cards = [] } = useQuery({
    queryKey: ["fleet-cards", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_cards").select("*")
        .eq("company_id", currentCompanyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as FuelCard[];
    },
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet-vehicles-min", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles")
        .select("id, plate, brand, model").eq("company_id", currentCompanyId!).order("plate");
      if (error) throw error;
      return data as Vehicle[];
    },
  });
  const { data: members = [] } = useQuery({
    queryKey: ["fleet-members", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return [] as Member[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? "Usuário" }));
    },
  });
  const { data: cardVehicles = [] } = useQuery({
    queryKey: ["fleet-card-vehicles", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_card_vehicles").select("*")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      return data as CardVehicle[];
    },
  });
  const { data: cardUsers = [] } = useQuery({
    queryKey: ["fleet-card-users", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_card_users").select("*")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      return data as CardUser[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fleet-cards"] });
    qc.invalidateQueries({ queryKey: ["fleet-card-vehicles"] });
    qc.invalidateQueries({ queryKey: ["fleet-card-users"] });
  };

  if (!isManager) {
    return (
      <div className="space-y-4">
        <Link to="/app/frota"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>
        <p className="text-sm text-muted-foreground">Apenas gestores podem gerenciar cartões.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link to="/app/frota"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Cartões combustível</h1>
          <p className="text-sm text-muted-foreground">Cadastre cartões e defina veículos e motoristas autorizados.</p>
        </div>
      </header>

      <NewCardForm companyId={currentCompanyId!} onSaved={invalidate} />

      <section className="space-y-3">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>
        ) : (
          cards.map((c) => (
            <CardRow
              key={c.id}
              card={c}
              vehicles={vehicles}
              members={members}
              linkedVehicles={cardVehicles.filter((cv) => cv.card_id === c.id)}
              linkedUsers={cardUsers.filter((cu) => cu.card_id === c.id)}
              companyId={currentCompanyId!}
              onChange={invalidate}
            />
          ))
        )}
      </section>
    </div>
  );
}

function NewCardForm({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!number.trim()) throw new Error("Número obrigatório");
      let photo_path: string | null = null;
      if (photo) photo_path = await uploadFleetPhoto(companyId, "card", photo);
      const { error } = await supabase.from("fuel_cards").insert({
        company_id: companyId, number: number.trim(), label: label || null, photo_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cartão cadastrado");
      setOpen(false); setLabel(""); setNumber(""); setPhoto(null);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Novo cartão</h2>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" /> {open ? "Fechar" : "Adicionar"}
        </Button>
      </div>
      {open && (
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Nome do cartão</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Galp Frota" /></div>
          <div><Label>Número</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div>
            <Label>Foto do cartão</Label>
            <Input type="file" accept="image/*" capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Cadastrar</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CardRow({
  card, vehicles, members, linkedVehicles, linkedUsers, companyId, onChange,
}: {
  card: FuelCard; vehicles: Vehicle[]; members: Member[];
  linkedVehicles: CardVehicle[]; linkedUsers: CardUser[];
  companyId: string; onChange: () => void;
}) {
  const availableVehicles = useMemo(
    () => vehicles.filter((v) => !linkedVehicles.some((l) => l.vehicle_id === v.id)),
    [vehicles, linkedVehicles],
  );
  const availableMembers = useMemo(
    () => members.filter((m) => !linkedUsers.some((l) => l.user_id === m.id)),
    [members, linkedUsers],
  );

  const toggleStatus = useMutation({
    mutationFn: async () => {
      const next = card.status === "ativo" ? "inativo" : "ativo";
      const { error } = await supabase.from("fuel_cards").update({ status: next }).eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const addVehicle = useMutation({
    mutationFn: async (vehicleId: string) => {
      const { error } = await supabase.from("fuel_card_vehicles").insert({
        company_id: companyId, card_id: card.id, vehicle_id: vehicleId,
      });
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const removeVehicle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fuel_card_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const addUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("fuel_card_users").insert({
        company_id: companyId, card_id: card.id, user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fuel_card_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <SignedImg path={card.photo_path} className="h-16 w-24 rounded object-cover" />
        <div className="flex-1">
          <div className="font-display text-lg font-semibold">{card.label ?? "Cartão"}</div>
          <div className="text-sm text-muted-foreground">{card.number}</div>
          <button
            onClick={() => toggleStatus.mutate()}
            className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              card.status === "ativo" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {card.status}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs">Veículos autorizados</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value=""
            onChange={(e) => { if (e.target.value) addVehicle.mutate(e.target.value); }}
          >
            <option value="">{availableVehicles.length === 0 ? "Todos vinculados" : "Adicionar veículo…"}</option>
            {availableVehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate} — {[v.brand, v.model].filter(Boolean).join(" ")}</option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {linkedVehicles.map((l) => {
              const v = vehicles.find((x) => x.id === l.vehicle_id);
              return (
                <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                  {v?.plate ?? "—"}
                  <button className="text-destructive" onClick={() => removeVehicle.mutate(l.id)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <div>
          <Label className="text-xs">Motoristas autorizados</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value=""
            onChange={(e) => { if (e.target.value) addUser.mutate(e.target.value); }}
          >
            <option value="">{availableMembers.length === 0 ? "Todos vinculados" : "Adicionar motorista…"}</option>
            {availableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            {linkedUsers.map((l) => {
              const m = members.find((x) => x.id === l.user_id);
              return (
                <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                  {m?.name ?? "Usuário"}
                  <button className="text-destructive" onClick={() => removeUser.mutate(l.id)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
