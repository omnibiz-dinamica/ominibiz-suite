import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";

/**
 * Tabbed employee editor (Aba 1-6) for the Equipe module.
 * Uses partial updates on `profiles` and a separate table `employee_attachments`
 * + Supabase Storage buckets `employee-docs` and `employee-signatures`.
 */

type Role = "manager" | "employee" | "owner" | "super_admin";

export interface EmployeeEditorProps {
  userId: string;
  companyId: string;
  currentRole: Role;
  onDone: () => void;
}

// Loose record type — generated supabase types may lag behind new columns.
type ProfileRow = Record<string, unknown> & { id: string };

export function EmployeeEditor({ userId, companyId, currentRole, onDone }: EmployeeEditorProps) {
  const qc = useQueryClient();
  const { isOwner, isSuperAdmin } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["employee-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data as unknown as ProfileRow;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [tab, setTab] = useState("dados");

  if (isLoading || !profile) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>;
  }

  const save = async (patch: Record<string, unknown>, msg = "Salvo") => {
    const { error } = await (supabase.from("profiles") as unknown as {
      update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    }).update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
    qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
        <TabsTrigger value="dados">Dados</TabsTrigger>
        <TabsTrigger value="rh">RH</TabsTrigger>
        <TabsTrigger value="docs">Docs</TabsTrigger>
        <TabsTrigger value="fin">Financeiro</TabsTrigger>
        <TabsTrigger value="sig">Assinaturas</TabsTrigger>
        <TabsTrigger value="anx">Anexos</TabsTrigger>
      </TabsList>

      <TabsContent value="dados" className="space-y-4 pt-4">
        <TabDadosGerais
          profile={profile}
          companies={companies}
          currentRole={currentRole}
          userId={userId}
          companyId={companyId}
          canPromoteOwner={!!(isOwner || isSuperAdmin)}
          onSave={save}
          onDone={onDone}
        />
      </TabsContent>
      <TabsContent value="rh" className="space-y-4 pt-4">
        <TabRH profile={profile} onSave={save} />
      </TabsContent>
      <TabsContent value="docs" className="space-y-4 pt-4">
        <TabDocs profile={profile} onSave={save} />
      </TabsContent>
      <TabsContent value="fin" className="space-y-4 pt-4">
        <TabFinanceiro profile={profile} onSave={save} />
      </TabsContent>
      <TabsContent value="sig" className="space-y-4 pt-4">
        <TabAssinaturas profile={profile} userId={userId} companyId={companyId} onSave={save} />
      </TabsContent>
      <TabsContent value="anx" className="space-y-4 pt-4">
        <TabAnexos userId={userId} companyId={companyId} />
      </TabsContent>
    </Tabs>
  );
}

/* ----------------------------- helpers ------------------------------ */

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function num(v: unknown): string {
  return typeof v === "number" ? String(v) : str(v);
}
function toNullableNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toNullableString(s: string): string | null {
  return s.trim() === "" ? null : s.trim();
}
function toNullableDate(s: string): string | null {
  return s.trim() === "" ? null : s;
}

/* --------------------------- Aba 1 ---------------------------------- */

function TabDadosGerais({
  profile, companies, currentRole, userId, companyId, canPromoteOwner, onSave, onDone,
}: {
  profile: ProfileRow;
  companies: { id: string; name: string }[];
  currentRole: Role;
  userId: string;
  companyId: string;
  canPromoteOwner: boolean;
  onSave: (p: Record<string, unknown>, msg?: string) => Promise<void>;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(str(profile.full_name));
  const [phone, setPhone] = useState(str(profile.phone));
  const [companyPrimary, setCompanyPrimary] = useState(str(profile.company_id_primary));
  const [jobTitle, setJobTitle] = useState(str(profile.job_title));
  const [workLocation, setWorkLocation] = useState(str(profile.work_location));
  const [teamNumber, setTeamNumber] = useState(num(profile.team_number));
  const [addressBe, setAddressBe] = useState(str(profile.address_be));
  const [status, setStatus] = useState(
    str(profile.status) || (profile.is_active === false ? "inativo" : "ativo"),
  );
  const [role, setRole] = useState<Role>(currentRole);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await onSave({
            full_name: toNullableString(fullName),
            phone: toNullableString(phone),
            company_id_primary: toNullableString(companyPrimary),
            job_title: toNullableString(jobTitle),
            work_location: toNullableString(workLocation),
            team_number: teamNumber ? Number(teamNumber) : null,
            address_be: toNullableString(addressBe),
            status,
            is_active: status === "ativo",
          });
          if (role !== currentRole) {
            const { error } = await (supabase.rpc as unknown as (
              fn: string, args: Record<string, unknown>,
            ) => Promise<{ error: { message: string } | null }>)("set_member_role", {
              _user_id: userId, _company_id: companyId, _role: role,
            });
            if (error) throw new Error(error.message);
          }
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome completo">
          <Input maxLength={150} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Telefone">
          <Input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Empresa">
        <Select value={companyPrimary || "none"} onValueChange={(v) => setCompanyPrimary(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— sem empresa principal —</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cargo / Função">
          <Input maxLength={120} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <Field label="Local de trabalho principal">
          <Input maxLength={200} value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Equipa (1–10, opcional)">
          <Select value={teamNumber || "none"} onValueChange={(v) => setTeamNumber(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— sem equipa —</SelectItem>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Morada Bélgica">
        <Textarea rows={2} value={addressBe} onChange={(e) => setAddressBe(e.target.value)} />
      </Field>
      <Field label="Papel no sistema">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Funcionário</SelectItem>
            <SelectItem value="manager">Gestor</SelectItem>
            {canPromoteOwner && <SelectItem value="owner">Owner</SelectItem>}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando…" : "Salvar dados gerais"}
      </Button>
    </form>
  );
}

/* --------------------------- Aba 2 ---------------------------------- */

function TabRH({ profile, onSave }: { profile: ProfileRow; onSave: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [f, setF] = useState({
    hire_date: str(profile.hire_date),
    termination_date: str(profile.termination_date),
    birth_date: str(profile.birth_date),
    marital_status: str(profile.marital_status),
    dependents_count: num(profile.dependents_count),
    tax_id_nif: str(profile.tax_id_nif),
    social_security_niss: str(profile.social_security_niss),
    nationality: str(profile.nationality),
    tax_country: str(profile.tax_country),
    contract_type: str(profile.contract_type),
    weekly_contracted_hours: num(profile.weekly_contracted_hours),
  });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      try {
        await onSave({
          hire_date: toNullableDate(f.hire_date),
          termination_date: toNullableDate(f.termination_date),
          birth_date: toNullableDate(f.birth_date),
          marital_status: toNullableString(f.marital_status),
          dependents_count: f.dependents_count ? Number(f.dependents_count) : null,
          tax_id_nif: toNullableString(f.tax_id_nif),
          social_security_niss: toNullableString(f.social_security_niss),
          nationality: toNullableString(f.nationality),
          tax_country: toNullableString(f.tax_country),
          contract_type: toNullableString(f.contract_type),
          weekly_contracted_hours: toNullableNumber(f.weekly_contracted_hours),
        }, "Dados RH salvos");
      } catch (err) { toast.error((err as Error).message); }
      finally { setLoading(false); }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data de admissão"><Input type="date" value={f.hire_date} onChange={upd("hire_date")} /></Field>
        <Field label="Data de rescisão"><Input type="date" value={f.termination_date} onChange={upd("termination_date")} /></Field>
        <Field label="Data de nascimento"><Input type="date" value={f.birth_date} onChange={upd("birth_date")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Estado civil">
          <Select value={f.marital_status || "none"} onValueChange={(v) => setF((s) => ({ ...s, marital_status: v === "none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="solteiro">Solteiro(a)</SelectItem>
              <SelectItem value="casado">Casado(a)</SelectItem>
              <SelectItem value="uniao_facto">União de facto</SelectItem>
              <SelectItem value="divorciado">Divorciado(a)</SelectItem>
              <SelectItem value="viuvo">Viúvo(a)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nº dependentes"><Input type="number" min="0" value={f.dependents_count} onChange={upd("dependents_count")} /></Field>
        <Field label="Horas semanais"><Input type="number" step="0.5" value={f.weekly_contracted_hours} onChange={upd("weekly_contracted_hours")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="NIF"><Input value={f.tax_id_nif} onChange={upd("tax_id_nif")} /></Field>
        <Field label="NISS"><Input value={f.social_security_niss} onChange={upd("social_security_niss")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nacionalidade"><Input value={f.nationality} onChange={upd("nationality")} placeholder="Ex.: Portuguesa" /></Field>
        <Field label="País fiscal"><Input value={f.tax_country} onChange={upd("tax_country")} placeholder="Ex.: PT" /></Field>
        <Field label="Tipo de contrato">
          <Select value={f.contract_type || "none"} onValueChange={(v) => setF((s) => ({ ...s, contract_type: v === "none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="sem_termo">Sem termo</SelectItem>
              <SelectItem value="termo_certo">Termo certo</SelectItem>
              <SelectItem value="termo_incerto">Termo incerto</SelectItem>
              <SelectItem value="prestacao_servicos">Prestação de serviços</SelectItem>
              <SelectItem value="estagio">Estágio</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Salvando…" : "Salvar RH"}</Button>
    </form>
  );
}

/* --------------------------- Aba 3 ---------------------------------- */

function TabDocs({ profile, onSave }: { profile: ProfileRow; onSave: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [f, setF] = useState({
    main_doc_type: str(profile.main_doc_type) || "CC",
    main_doc_number: str(profile.main_doc_number),
    main_doc_expires_at: str(profile.main_doc_expires_at),
    official_address: str(profile.official_address),
    a1_number: str(profile.a1_number),
    a1_expires_at: str(profile.a1_expires_at),
    driver_license_number: str(profile.driver_license_number),
    driver_license_expires_at: str(profile.driver_license_expires_at),
    passport_number: str(profile.passport_number),
    passport_expires_at: str(profile.passport_expires_at),
    health_card_number: str(profile.health_card_number),
    health_card_expires_at: str(profile.health_card_expires_at),
    occ_health_last_at: str(profile.occ_health_last_at),
    occ_health_next_at: str(profile.occ_health_next_at),
  });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      try {
        await onSave({
          main_doc_type: f.main_doc_type,
          main_doc_number: toNullableString(f.main_doc_number),
          main_doc_expires_at: toNullableDate(f.main_doc_expires_at),
          official_address: toNullableString(f.official_address),
          a1_number: toNullableString(f.a1_number),
          a1_expires_at: toNullableDate(f.a1_expires_at),
          driver_license_number: toNullableString(f.driver_license_number),
          driver_license_expires_at: toNullableDate(f.driver_license_expires_at),
          passport_number: toNullableString(f.passport_number),
          passport_expires_at: toNullableDate(f.passport_expires_at),
          health_card_number: toNullableString(f.health_card_number),
          health_card_expires_at: toNullableDate(f.health_card_expires_at),
          occ_health_last_at: toNullableDate(f.occ_health_last_at),
          occ_health_next_at: toNullableDate(f.occ_health_next_at),
        }, "Documentos salvos");
      } catch (err) { toast.error((err as Error).message); }
      finally { setLoading(false); }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo doc principal">
          <Select value={f.main_doc_type} onValueChange={(v) => setF((s) => ({ ...s, main_doc_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CC">Cartão de Cidadão</SelectItem>
              <SelectItem value="TR">Título de Residência</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Número"><Input value={f.main_doc_number} onChange={upd("main_doc_number")} /></Field>
        <Field label="Validade"><Input type="date" value={f.main_doc_expires_at} onChange={upd("main_doc_expires_at")} /></Field>
      </div>
      <Field label="Morada oficial">
        <Textarea rows={2} value={f.official_address} onChange={upd("official_address")} />
      </Field>
      <DocPair label="A1" num={f.a1_number} date={f.a1_expires_at} onNum={upd("a1_number")} onDate={upd("a1_expires_at")} />
      <DocPair label="Carta de condução" num={f.driver_license_number} date={f.driver_license_expires_at} onNum={upd("driver_license_number")} onDate={upd("driver_license_expires_at")} />
      <DocPair label="Passaporte" num={f.passport_number} date={f.passport_expires_at} onNum={upd("passport_number")} onDate={upd("passport_expires_at")} />
      <DocPair label="Cartão de saúde" num={f.health_card_number} date={f.health_card_expires_at} onNum={upd("health_card_number")} onDate={upd("health_card_expires_at")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Medicina trabalho — última"><Input type="date" value={f.occ_health_last_at} onChange={upd("occ_health_last_at")} /></Field>
        <Field label="Medicina trabalho — próxima"><Input type="date" value={f.occ_health_next_at} onChange={upd("occ_health_next_at")} /></Field>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Salvando…" : "Salvar documentos"}</Button>
    </form>
  );
}

function DocPair({ label, num, date, onNum, onDate }: { label: string; num: string; date: string; onNum: (e: { target: { value: string } }) => void; onDate: (e: { target: { value: string } }) => void; }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="text-sm font-medium pt-7 text-muted-foreground">{label}</div>
      <Field label="Número"><Input value={num} onChange={onNum} /></Field>
      <Field label="Validade"><Input type="date" value={date} onChange={onDate} /></Field>
    </div>
  );
}

/* --------------------------- Aba 4 ---------------------------------- */

function TabFinanceiro({ profile, onSave }: { profile: ProfileRow; onSave: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [f, setF] = useState({
    iban: str(profile.iban),
    swift: str(profile.swift),
    rate_hour_week: num(profile.rate_hour_week),
    rate_hour_weekend: num(profile.rate_hour_weekend),
    rate_day_be: num(profile.rate_day_be),
    rate_day_foreign: num(profile.rate_day_foreign),
    allowance_meal: num(profile.allowance_meal),
    allowance_transport: num(profile.allowance_transport),
    allowance_rent: num(profile.allowance_rent),
    allowance_other: num(profile.allowance_other),
  });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setLoading(true);
      try {
        await onSave({
          iban: toNullableString(f.iban),
          swift: toNullableString(f.swift),
          rate_hour_week: toNullableNumber(f.rate_hour_week),
          rate_hour_weekend: toNullableNumber(f.rate_hour_weekend),
          rate_day_be: toNullableNumber(f.rate_day_be),
          rate_day_foreign: toNullableNumber(f.rate_day_foreign),
          allowance_meal: toNullableNumber(f.allowance_meal),
          allowance_transport: toNullableNumber(f.allowance_transport),
          allowance_rent: toNullableNumber(f.allowance_rent),
          allowance_other: toNullableNumber(f.allowance_other),
        }, "Financeiro salvo");
      } catch (err) { toast.error((err as Error).message); }
      finally { setLoading(false); }
    }}>
      <p className="text-xs text-muted-foreground">
        Estes valores são informativos para RH. Os valores que alimentam folha e valorizações continuam em
        “Configurações financeiras”.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="IBAN"><Input value={f.iban} onChange={upd("iban")} /></Field>
        <Field label="SWIFT"><Input value={f.swift} onChange={upd("swift")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor hora — semana"><Input type="number" step="0.01" value={f.rate_hour_week} onChange={upd("rate_hour_week")} /></Field>
        <Field label="Valor hora — fim de semana/feriado"><Input type="number" step="0.01" value={f.rate_hour_weekend} onChange={upd("rate_hour_weekend")} /></Field>
        <Field label="Valor dia — Bélgica"><Input type="number" step="0.01" value={f.rate_day_be} onChange={upd("rate_day_be")} /></Field>
        <Field label="Valor dia — estrangeiro"><Input type="number" step="0.01" value={f.rate_day_foreign} onChange={upd("rate_day_foreign")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Alimentação"><Input type="number" step="0.01" value={f.allowance_meal} onChange={upd("allowance_meal")} /></Field>
        <Field label="Transporte"><Input type="number" step="0.01" value={f.allowance_transport} onChange={upd("allowance_transport")} /></Field>
        <Field label="Renda"><Input type="number" step="0.01" value={f.allowance_rent} onChange={upd("allowance_rent")} /></Field>
        <Field label="Outros"><Input type="number" step="0.01" value={f.allowance_other} onChange={upd("allowance_other")} /></Field>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Salvando…" : "Salvar financeiro"}</Button>
    </form>
  );
}

/* --------------------------- Aba 5 ---------------------------------- */

function TabAssinaturas({ profile, userId, companyId, onSave }: { profile: ProfileRow; userId: string; companyId: string; onSave: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [signatureUrl, setSignatureUrl] = useState(str(profile.signature_url));
  const [initialsUrl, setInitialsUrl] = useState(str(profile.initials_url));
  const [busy, setBusy] = useState<"sig" | "ini" | null>(null);

  const upload = async (kind: "sig" | "ini", file: File) => {
    setBusy(kind);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${companyId}/${userId}/${kind === "sig" ? "signature" : "initials"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("employee-signatures").upload(path, file, { upsert: true });
      if (error) throw error;
      const patch = kind === "sig" ? { signature_url: path } : { initials_url: path };
      await onSave(patch, "Imagem salva");
      if (kind === "sig") setSignatureUrl(path); else setInitialsUrl(path);
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Preparado para uso futuro em folha de ponto, relatórios, recibos e contratos. Envie PNG com fundo transparente.
      </p>
      <SignatureSlot label="Assinatura digital" path={signatureUrl} loading={busy === "sig"} onPick={(f) => upload("sig", f)} />
      <SignatureSlot label="Visto digital (rubrica)" path={initialsUrl} loading={busy === "ini"} onPick={(f) => upload("ini", f)} />
    </div>
  );
}

function SignatureSlot({ label, path, loading, onPick }: { label: string; path: string; loading: boolean; onPick: (f: File) => void }) {
  const [preview, setPreview] = useState<string>("");
  useEffect(() => {
    let revoked = false;
    (async () => {
      if (!path) { setPreview(""); return; }
      const { data } = await supabase.storage.from("employee-signatures").createSignedUrl(path, 60 * 10);
      if (!revoked) setPreview(data?.signedUrl ?? "");
    })();
    return () => { revoked = true; };
  }, [path]);
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1 text-xs hover:bg-muted">
          <Upload className="h-3 w-3" /> {loading ? "Enviando…" : "Enviar"}
          <input
            type="file" accept="image/png,image/jpeg" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }}
          />
        </label>
      </div>
      <div className="flex h-24 items-center justify-center rounded-md bg-muted/30">
        {preview
          ? <img src={preview} alt={label} className="max-h-20 object-contain" />
          : <span className="text-xs text-muted-foreground">— sem imagem —</span>}
      </div>
    </div>
  );
}

/* --------------------------- Aba 6 ---------------------------------- */

const ATTACH_CATEGORIES = [
  { v: "cc", l: "Cartão de Cidadão" },
  { v: "tr", l: "Título de Residência" },
  { v: "passport", l: "Passaporte" },
  { v: "driver_license", l: "Carta de Condução" },
  { v: "a1", l: "A1" },
  { v: "work_contract", l: "Contrato de Trabalho" },
  { v: "health_card", l: "Cartão Saúde" },
  { v: "other", l: "Outro" },
];

function TabAnexos({ userId, companyId }: { userId: string; companyId: string }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("cc");
  const [busy, setBusy] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["employee-attachments", userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("employee_attachments" as never) as unknown as {
        select: (s: string) => { eq: (c: string, v: string) => { order: (c: string, opt: { ascending: boolean }) => Promise<{ data: AttachmentRow[] | null; error: { message: string } | null }> } };
      }).select("*").eq("profile_id", userId).order("uploaded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${companyId}/${userId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("employee-docs").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await (supabase.from("employee_attachments" as never) as unknown as {
        insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).insert({
        profile_id: userId, company_id: companyId, category,
        file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size,
      });
      if (error) throw new Error(error.message);
      toast.success("Anexo adicionado");
      qc.invalidateQueries({ queryKey: ["employee-attachments", userId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  };

  const onDownload = async (it: AttachmentRow) => {
    const { data } = await supabase.storage.from("employee-docs").createSignedUrl(it.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const onDelete = async (it: AttachmentRow) => {
    if (!confirm(`Remover "${it.file_name}"?`)) return;
    await supabase.storage.from("employee-docs").remove([it.storage_path]);
    const { error } = await (supabase.from("employee_attachments" as never) as unknown as {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    }).delete().eq("id", it.id);
    if (error) toast.error(error.message);
    else { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["employee-attachments", userId] }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-4">
        <Field label="Categoria">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ATTACH_CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
          <Upload className="h-4 w-4" /> {busy ? "Enviando…" : "Enviar arquivo"}
          <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
        </label>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {items.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nenhum anexo.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{it.file_name}</div>
              <div className="text-xs text-muted-foreground">
                {labelForCategory(it.category)} · {new Date(it.uploaded_at).toLocaleDateString("pt-PT")}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" onClick={() => onDownload(it)} title="Baixar"><Download className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(it)} title="Remover"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type AttachmentRow = {
  id: string;
  profile_id: string;
  company_id: string;
  category: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

function labelForCategory(v: string): string {
  return ATTACH_CATEGORIES.find((c) => c.v === v)?.l ?? v;
}

/* --------------------------- shared --------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// keep imports tidy for tree-shakers
void useMemo;