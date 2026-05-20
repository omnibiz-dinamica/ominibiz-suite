import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Car, Fuel, CreditCard, Plus, History, X } from "lucide-react";
import { VEHICLE_BRANDS, VEHICLE_KIND_LABELS, VEHICLE_KINDS } from "@/lib/vehicle-brands";

export const Route = createFileRoute("/app/frota")({ component: FrotaPage });

type Vehicle = {
  id: string; company_id: string; plate: string; brand: string | null; model: string | null;
  year: number | null; current_km: number; fuel_type: string; kind: string; status: string;
  plate_photo_path: string | null;
};
type Assignment = { id: string; vehicle_id: string; user_id: string };
type FuelCard = {
  id: string; number: string; label: string | null; photo_path: string | null; status: string;
};
type CardVehicle = { id: string; card_id: string; vehicle_id: string };
type CardUser = { id: string; card_id: string; user_id: string };
type FuelRecord = {
  id: string; vehicle_id: string; driver_id: string; card_id: string | null;
  km: number; liters: number; amount: number; price_per_liter: number | null;
  purpose: "profissional" | "pessoal";
  pump_photo_path: string | null; plate_photo_path: string | null; recorded_at: string;
};

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

function FrotaPage() {
  const { user, currentCompanyId, isManager, effectiveRole } = useAuth();
  const qc = useQueryClient();
  const isEmployee = effectiveRole === "employee";

  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet-vehicles", currentCompanyId, effectiveRole],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*")
        .eq("company_id", currentCompanyId!).order("plate");
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["fleet-assignments", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_assignments").select("*")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      return data as Assignment[];
    },
  });

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

  const { data: records = [] } = useQuery({
    queryKey: ["fleet-records", currentCompanyId, effectiveRole],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      let q = supabase.from("fuel_records").select("*")
        .eq("company_id", currentCompanyId!).order("recorded_at", { ascending: false }).limit(100);
      if (isEmployee) q = q.eq("driver_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as FuelRecord[];
    },
  });

  const memberIds = useMemo(
    () => Array.from(new Set(assignments.map((a) => a.user_id).concat(records.map((r) => r.driver_id)))),
    [assignments, records],
  );
  const { data: names = {} } = useQuery({
    queryKey: ["fleet-names", memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", memberIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name ?? "Usuário"]));
    },
  });

  const { data: companyMembers = [] } = useQuery({
    queryKey: ["fleet-members", currentCompanyId],
    enabled: !!currentCompanyId && isManager,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id")
        .eq("company_id", currentCompanyId!);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? "Usuário" }));
    },
  });

  const myVehicles = useMemo(
    () => vehicles.filter((v) => assignments.some((a) => a.vehicle_id === v.id && a.user_id === user?.id)),
    [vehicles, assignments, user?.id],
  );
  const driverVehicles = isManager ? vehicles : myVehicles;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <Car className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">Frota</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Veículos, motoristas vinculados e abastecimentos." : "Seus veículos e abastecimentos."}
          </p>
        </div>
        {isManager && (
          <Link to="/app/frota/cartoes">
            <Button variant="outline" size="sm">
              <CreditCard className="h-4 w-4" /> Cartões combustível
            </Button>
          </Link>
        )}
      </header>

      {isManager && (
        <VehicleManager
          vehicles={vehicles}
          assignments={assignments}
          members={companyMembers}
          companyId={currentCompanyId!}
          onChange={() => {
            qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
            qc.invalidateQueries({ queryKey: ["fleet-assignments"] });
          }}
        />
      )}

      {!isManager && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Meus veículos</h2>
          {myVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não possui veículo autorizado.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {myVehicles.map((v) => <VehicleCard key={v.id} v={v} />)}
            </ul>
          )}
        </section>
      )}

      {(isManager || myVehicles.length > 0) && (
        <FuelForm
          companyId={currentCompanyId!}
          driverId={user!.id}
          isManager={isManager}
          vehicles={driverVehicles}
          cards={cards}
          cardVehicles={cardVehicles}
          cardUsers={cardUsers}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["fleet-records"] });
            qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
          }}
        />
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> Histórico</h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum abastecimento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Veículo</th>
                  <th className="py-2 pr-3">Motorista</th>
                  <th className="py-2 pr-3">KM</th>
                  <th className="py-2 pr-3">Litros</th>
                  <th className="py-2 pr-3">€/L</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Finalidade</th>
                  <th className="py-2 pr-3">Bomba</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const v = vehicles.find((x) => x.id === r.vehicle_id);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 pr-3">{new Date(r.recorded_at).toLocaleString()}</td>
                      <td className="py-2 pr-3">{v?.plate ?? "—"}</td>
                      <td className="py-2 pr-3">{names[r.driver_id] ?? "—"}</td>
                      <td className="py-2 pr-3">{r.km}</td>
                      <td className="py-2 pr-3">{Number(r.liters).toFixed(2)}</td>
                      <td className="py-2 pr-3">{r.price_per_liter ? Number(r.price_per_liter).toFixed(3) : "—"}</td>
                      <td className="py-2 pr-3">{Number(r.amount).toFixed(2)}</td>
                      <td className="py-2 pr-3 capitalize">{r.purpose}</td>
                      <td className="py-2 pr-3"><SignedImg path={r.pump_photo_path} className="h-10 w-10 rounded object-cover" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function VehicleCard({ v }: { v: Vehicle }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-display text-lg font-semibold">{v.plate}</div>
          <div className="text-sm text-muted-foreground">
            {[v.brand, v.model, v.year].filter(Boolean).join(" • ")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {v.current_km.toLocaleString()} km • {v.fuel_type} • {VEHICLE_KIND_LABELS[v.kind] ?? v.kind} • {v.status}
          </div>
        </div>
      </div>
    </div>
  );
}

function VehicleManager({
  vehicles, assignments, members, companyId, onChange,
}: {
  vehicles: Vehicle[]; assignments: Assignment[];
  members: { id: string; name: string }[]; companyId: string; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [kind, setKind] = useState<string>("carro");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>("");
  const [km, setKm] = useState<string>("0");
  const [fuelTypeV, setFuelTypeV] = useState("flex");

  const brandsForKind = VEHICLE_BRANDS[kind] ?? {};
  const modelsForBrand = brand ? brandsForKind[brand] ?? [] : [];

  useEffect(() => { setBrand(""); setModel(""); }, [kind]);
  useEffect(() => { setModel(""); }, [brand]);

  const create = useMutation({
    mutationFn: async () => {
      if (!plate.trim()) throw new Error("Matrícula obrigatória");
      const { error } = await supabase.from("vehicles").insert({
        company_id: companyId,
        plate: plate.trim().toUpperCase(),
        brand: brand || null, model: model || null,
        year: year ? Number(year) : null,
        current_km: Number(km) || 0,
        fuel_type: fuelTypeV as any, kind: kind as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo cadastrado");
      setOpen(false);
      setPlate(""); setBrand(""); setModel(""); setYear(""); setKm("0");
      onChange();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const assign = useMutation({
    mutationFn: async ({ vehicleId, userId }: { vehicleId: string; userId: string }) => {
      const { error } = await supabase.from("vehicle_assignments").insert({
        company_id: companyId, vehicle_id: vehicleId, user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vinculado"); onChange(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Desvinculado"); onChange(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Veículos ({vehicles.length})</h2>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" /> {open ? "Fechar" : "Novo veículo"}
        </Button>
      </div>

      {open && (
        <div className="mb-4 grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-3">
          <div>
            <Label>Matrícula / Placa</Label>
            <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="AA-00-AA" />
          </div>
          <div>
            <Label>Tipo</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={kind} onChange={(e) => setKind(e.target.value)}>
              {VEHICLE_KINDS.map((x) => <option key={x} value={x}>{VEHICLE_KIND_LABELS[x]}</option>)}
            </select>
          </div>
          <div>
            <Label>Combustível</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={fuelTypeV} onChange={(e) => setFuelTypeV(e.target.value)}>
              {["gasolina","diesel","etanol","flex","gnv","eletrico","hibrido"].map((x) =>
                <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <Label>Marca</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Selecionar…</option>
              {Object.keys(brandsForKind).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <Label>Modelo</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={model} onChange={(e) => setModel(e.target.value)} disabled={!brand}>
              <option value="">{brand ? "Selecionar…" : "Escolha marca antes"}</option>
              {modelsForBrand.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><Label>Ano</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <div><Label>KM atual</Label><Input type="number" value={km} onChange={(e) => setKm(e.target.value)} /></div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Cadastrar veículo</Button>
          </div>
        </div>
      )}

      {vehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
      ) : (
        <ul className="space-y-3">
          {vehicles.map((v) => {
            const linked = assignments.filter((a) => a.vehicle_id === v.id);
            const available = members.filter((m) => !linked.some((l) => l.user_id === m.id));
            return (
              <li key={v.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-semibold">{v.plate}</div>
                    <div className="text-sm text-muted-foreground">
                      {[v.brand, v.model, v.year].filter(Boolean).join(" • ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.current_km.toLocaleString()} km • {v.fuel_type} • {VEHICLE_KIND_LABELS[v.kind] ?? v.kind} • {v.status}
                    </div>
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <Label className="text-xs">Vincular motoristas</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      value=""
                      onChange={(e) => {
                        const uid = e.target.value;
                        if (uid) assign.mutate({ vehicleId: v.id, userId: uid });
                      }}
                    >
                      <option value="">{available.length === 0 ? "Todos já vinculados" : "Adicionar motorista…"}</option>
                      {available.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    {linked.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {linked.map((l) => {
                          const member = members.find((m) => m.id === l.user_id);
                          return (
                            <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                              {member?.name ?? "Usuário"}
                              <button className="text-destructive" onClick={() => unassign.mutate(l.id)} aria-label="Remover">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FuelForm({
  companyId, driverId, isManager, vehicles, cards, cardVehicles, cardUsers, onSaved,
}: {
  companyId: string; driverId: string; isManager: boolean;
  vehicles: Vehicle[]; cards: FuelCard[];
  cardVehicles: CardVehicle[]; cardUsers: CardUser[];
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [km, setKm] = useState<string>("");
  const [liters, setLiters] = useState<string>("");
  const [pricePerLiter, setPricePerLiter] = useState<string>("");
  const [purpose, setPurpose] = useState<"profissional" | "pessoal">("profissional");
  const [pumpPhoto, setPumpPhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [cardId, setCardId] = useState<string>("");

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const total = useMemo(() => {
    const l = Number(liters), p = Number(pricePerLiter);
    return l > 0 && p > 0 ? l * p : 0;
  }, [liters, pricePerLiter]);

  // Cartões disponíveis = autorizados para o motorista E para o veículo selecionado, e ativos.
  const availableCards = useMemo(() => {
    if (!vehicleId) return [] as FuelCard[];
    return cards.filter((c) => {
      if (c.status !== "ativo") return false;
      const vehicleOk = cardVehicles.some((cv) => cv.card_id === c.id && cv.vehicle_id === vehicleId);
      const userOk = isManager || cardUsers.some((cu) => cu.card_id === c.id && cu.user_id === driverId);
      return vehicleOk && userOk;
    });
  }, [cards, cardVehicles, cardUsers, vehicleId, driverId, isManager]);

  useEffect(() => {
    if (cardId && !availableCards.some((c) => c.id === cardId)) setCardId("");
  }, [availableCards, cardId]);

  const selectedCard = availableCards.find((c) => c.id === cardId) || null;
  const needPlatePhoto = !!selectedVehicle && !selectedVehicle.plate_photo_path;

  const submit = useMutation({
    mutationFn: async () => {
      if (!vehicleId) throw new Error("Selecione um veículo");
      if (!km || !liters || !pricePerLiter) throw new Error("Preencha KM, litros e €/litro");
      if (!pumpPhoto) throw new Error("Foto da bomba é obrigatória");
      if (needPlatePhoto && !platePhoto) throw new Error("Foto da matrícula obrigatória (primeira vez)");

      let plate_photo_path: string | null = selectedVehicle?.plate_photo_path ?? null;
      if (needPlatePhoto && platePhoto) {
        plate_photo_path = await uploadFleetPhoto(companyId, "plate", platePhoto);
        await supabase.from("vehicles").update({ plate_photo_path }).eq("id", vehicleId);
      }
      const pump_photo_path = await uploadFleetPhoto(companyId, "pump", pumpPhoto);
      const amount = Number(liters) * Number(pricePerLiter);

      const { error: insErr } = await supabase.from("fuel_records").insert({
        company_id: companyId,
        vehicle_id: vehicleId,
        driver_id: driverId,
        card_id: cardId || null,
        km: Number(km),
        liters: Number(liters),
        price_per_liter: Number(pricePerLiter),
        amount,
        purpose,
        pump_photo_path,
        plate_photo_path,
      });
      if (insErr) throw insErr;

      await supabase.from("vehicles").update({ current_km: Number(km) }).eq("id", vehicleId);
    },
    onSuccess: () => {
      toast.success("Abastecimento registrado");
      setKm(""); setLiters(""); setPricePerLiter(""); setPumpPhoto(null); setPlatePhoto(null);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Fuel className="h-4 w-4" /> Registrar abastecimento</h2>
      {vehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum veículo disponível.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Veículo</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Selecionar…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} — {[v.brand, v.model].filter(Boolean).join(" ")}</option>)}
            </select>
          </div>
          <div><Label>KM atual</Label><Input type="number" value={km} onChange={(e) => setKm(e.target.value)} /></div>
          <div>
            <Label>Finalidade</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={purpose} onChange={(e) => setPurpose(e.target.value as any)}>
              <option value="profissional">profissional</option>
              <option value="pessoal">pessoal</option>
            </select>
          </div>
          <div><Label>Litros</Label><Input type="number" step="0.01" value={liters} onChange={(e) => setLiters(e.target.value)} /></div>
          <div><Label>Valor por litro (€)</Label><Input type="number" step="0.001" value={pricePerLiter} onChange={(e) => setPricePerLiter(e.target.value)} /></div>
          <div>
            <Label>Total calculado</Label>
            <Input value={total ? total.toFixed(2) : ""} readOnly disabled />
          </div>
          <div>
            <Label>Foto da bomba</Label>
            <Input type="file" accept="image/*" capture="environment"
              onChange={(e) => setPumpPhoto(e.target.files?.[0] ?? null)} />
          </div>
          {needPlatePhoto && (
            <div>
              <Label>Foto da matrícula (1ª vez)</Label>
              <Input type="file" accept="image/*" capture="environment"
                onChange={(e) => setPlatePhoto(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {!needPlatePhoto && selectedVehicle?.plate_photo_path && (
            <div>
              <Label>Matrícula registrada</Label>
              <SignedImg path={selectedVehicle.plate_photo_path} className="h-9 w-24 rounded object-cover" />
            </div>
          )}

          <div className="md:col-span-3 rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <CreditCard className="h-4 w-4" /> Cartão combustível
            </div>
            {!vehicleId ? (
              <p className="text-xs text-muted-foreground">Selecione um veículo para listar os cartões autorizados.</p>
            ) : availableCards.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum cartão autorizado para este veículo/motorista.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Cartão</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={cardId} onChange={(e) => setCardId(e.target.value)}>
                    <option value="">Sem cartão</option>
                    {availableCards.map((c) => (
                      <option key={c.id} value={c.id}>{c.label ? `${c.label} — ` : ""}{c.number}</option>
                    ))}
                  </select>
                </div>
                {selectedCard && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <SignedImg path={selectedCard.photo_path} className="h-12 w-20 rounded object-cover" />
                    <div>
                      <div className="font-medium text-foreground">{selectedCard.number}</div>
                      {selectedCard.label && <div>{selectedCard.label}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-3 flex justify-end">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              <Fuel className="h-4 w-4" /> Registrar abastecimento
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
