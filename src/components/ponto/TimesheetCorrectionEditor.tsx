/**
 * Correção pelo gestor no "Ver" do Fechamento mensal (SUP-2026-000301).
 * Edita data/hora de entrada e saída e o cliente de cada ponto do mês e grava
 * tudo de uma vez (`timesheet_manager_correct`) sem fechar o modal. O banco:
 * motivo obrigatório, data só dentro do mês, bloqueia horários sobrepostos e,
 * se a folha estava assinada, cria a versão seguinte com a mesma assinatura.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { buildSnapshot, type SnapshotEntry } from "@/lib/timesheet";
import { weekdayLetter, zonedLocalToIso } from "@/lib/timesheet-view";
import { formatWallDate } from "@/lib/wall-clock";

type Draft = { start: string; end: string; clientId: string };

export type CorrectionChange = {
  time_entry_id: string;
  started_at?: string;
  ended_at?: string;
  client_id?: string;
};

export async function saveTimesheetCorrection(
  periodId: string,
  changes: CorrectionChange[],
  reason: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("timesheet_manager_correct", {
    _period_id: periodId,
    _changes: changes,
    _reason: reason,
  });
  if (error) throw new Error(error.message ?? "Não foi possível gravar a correção.");
  return data as { version: number; version_id: string | null; changed: number };
}

/** Só o que mudou, já em instantes ISO (a hora editada é a do sítio onde se marcou). */
export function buildCorrectionChanges(
  entries: SnapshotEntry[],
  drafts: Record<string, Draft>,
): CorrectionChange[] {
  const out: CorrectionChange[] = [];
  for (const e of entries) {
    const d = drafts[e.time_entry_id];
    if (!d) continue;
    const c: CorrectionChange = { time_entry_id: e.time_entry_id };
    if (d.start && d.start !== (e.started_local ?? "")) {
      const iso = zonedLocalToIso(d.start, e.time_zone);
      if (iso) c.started_at = iso;
    }
    if (d.end && d.end !== (e.ended_local ?? "")) {
      const iso = zonedLocalToIso(d.end, e.time_zone);
      if (iso) c.ended_at = iso;
    }
    if (d.clientId && d.clientId !== (e.client_id ?? "")) c.client_id = d.clientId;
    if (Object.keys(c).length > 1) out.push(c);
  }
  return out;
}

export function TimesheetCorrectionEditor({
  periodId,
  companyId,
  employeeId,
  year,
  month,
  onSaved,
  onCancel,
}: {
  periodId: string;
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  onSaved: (version: number) => void;
  onCancel: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reason, setReason] = useState("");

  // Dados atuais (não a versão assinada): é sobre eles que se corrige.
  const live = useQuery({
    queryKey: ["timesheet-correction-live", companyId, employeeId, year, month],
    queryFn: () => buildSnapshot({ companyId, employeeId, year, month }),
  });
  const { data: clients } = useQuery({
    queryKey: ["timesheet-correction-clients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const entries = useMemo(
    () =>
      (live.data?.days ?? [])
        .flatMap((d) => d.entries ?? [])
        .filter((e) => (e.entry_kind ?? "work") === "work"),
    [live.data],
  );
  const draftOf = (e: SnapshotEntry): Draft =>
    drafts[e.time_entry_id] ?? {
      start: e.started_local ?? "",
      end: e.ended_local ?? "",
      clientId: e.client_id ?? "",
    };
  const setDraft = (e: SnapshotEntry, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [e.time_entry_id]: { ...draftOf(e), ...patch } }));

  const changes = buildCorrectionChanges(entries, drafts);
  const monthMin = `${year}-${String(month).padStart(2, "0")}-01T00:00`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthMax = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59`;

  const save = useMutation({
    mutationFn: () => saveTimesheetCorrection(periodId, changes, reason.trim()),
    onSuccess: async (res) => {
      toast.success(
        res.version_id
          ? `Correção gravada. Nova versão ${res.version} com a assinatura do funcionário.`
          : "Correção gravada.",
      );
      setDrafts({});
      setReason("");
      await live.refetch();
      onSaved(res.version);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (live.isLoading)
    return <div className="text-sm text-muted-foreground">A carregar pontos…</div>;
  if (live.isError)
    return <div className="text-sm text-destructive">Não foi possível carregar os pontos.</div>;
  if (entries.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        Não há pontos trabalhados neste mês para corrigir.
      </div>
    );

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="text-sm font-medium">Corrigir pontos</div>
      <p className="text-xs text-muted-foreground">
        Horas na hora do sítio onde o funcionário marcou. A data só pode mudar dentro de{" "}
        {String(month).padStart(2, "0")}/{year}. Mudar o cliente muda o cliente da tarefa (só essa
        tarefa). Se a folha está assinada, é criada uma versão nova com a mesma assinatura.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Dia</th>
              <th className="px-2 py-1 text-left">Cliente</th>
              <th className="px-2 py-1 text-left">Entrada</th>
              <th className="px-2 py-1 text-left">Saída</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const d = draftOf(e);
              const day = (e.started_local ?? e.started_at).slice(0, 10);
              const changed = changes.some((c) => c.time_entry_id === e.time_entry_id);
              return (
                <tr
                  key={e.time_entry_id}
                  className={`border-t border-border ${changed ? "bg-amber-50" : ""}`}
                >
                  <td className="whitespace-nowrap px-2 py-1">
                    {formatWallDate(day)}{" "}
                    <span className="text-xs text-muted-foreground">{weekdayLetter(day)}</span>
                  </td>
                  <td className="px-2 py-1">
                    {e.task_id ? (
                      <Select
                        value={d.clientId}
                        onValueChange={(v) => setDraft(e, { clientId: v })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={e.client_name ?? "Sem cliente"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(clients ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{e.client_name ?? "Sem tarefa"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="datetime-local"
                      className="h-8"
                      min={monthMin}
                      max={monthMax}
                      value={d.start}
                      onChange={(ev) => setDraft(e, { start: ev.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    {e.ended_at ? (
                      <Input
                        type="datetime-local"
                        className="h-8"
                        value={d.end}
                        onChange={(ev) => setDraft(e, { end: ev.target.value })}
                      />
                    ) : (
                      <span className="text-xs text-warning">em aberto</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Motivo da correção (obrigatório)</Label>
        <Textarea
          rows={2}
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          placeholder="Ex.: funcionário esqueceu de terminar o ponto à hora certa"
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {changes.length > 0 ? `${changes.length} ponto(s) alterado(s)` : "Sem alterações"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={save.isPending}
        >
          Fechar edição
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={changes.length === 0 || reason.trim().length < 3 || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "A gravar…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
