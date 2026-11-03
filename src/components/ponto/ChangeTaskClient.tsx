/**
 * Mudar o cliente da TAREFA de um ponto (SUP-2026-000301), no editor do ponto.
 * Muda só essa tarefa (nunca a série nem os colegas da mesma visita). O banco
 * recalcula o valor, regista no histórico do ponto e bloqueia se a folha do mês
 * já foi assinada/fechada (`punch_admin_change_task_client`).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type ClientOption = { id: string; name: string };

export async function changeTaskClient(timeEntryId: string, clientId: string, reason: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("punch_admin_change_task_client", {
    _time_entry_id: timeEntryId,
    _client_id: clientId,
    _reason: reason,
  });
  if (error) throw new Error(error.message ?? "Não foi possível mudar o cliente.");
  return data as {
    task_id: string;
    old_client: string | null;
    new_client: string;
    entries: number;
  };
}

export function ChangeTaskClient({
  entryId,
  companyId,
  clientName,
}: {
  entryId: string;
  companyId: string;
  clientName: string | null | undefined;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState("");
  const [shownName, setShownName] = useState<string | null | undefined>(clientName);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["punch-change-client-options", companyId],
    enabled: editing && !!companyId,
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientOption[];
    },
  });

  const save = useMutation({
    mutationFn: () => changeTaskClient(entryId, clientId, reason.trim()),
    onSuccess: (res) => {
      setShownName(res.new_client);
      setEditing(false);
      setClientId("");
      setReason("");
      toast.success(`Cliente da tarefa alterado para ${res.new_client}.`);
      qc.invalidateQueries({ queryKey: ["punch-admin-list"] });
      qc.invalidateQueries({ queryKey: ["punch-audit"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span>
          <span className="text-muted-foreground">Cliente:</span> {shownName ?? "Sem cliente"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => setEditing(true)}
        >
          Mudar cliente
        </Button>
      </div>
    );
  }

  const canSave = !!clientId && reason.trim().length >= 3 && !save.isPending;

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2">
      <div>
        <span className="text-muted-foreground">Cliente atual:</span> {shownName ?? "Sem cliente"}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Novo cliente da tarefa</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "A carregar…" : "Selecione o cliente"} />
          </SelectTrigger>
          <SelectContent>
            {(clients ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Motivo (obrigatório)</Label>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: tarefa criada com o cliente errado"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Muda só esta tarefa (não a série nem os colegas da mesma visita). O valor dos pontos é
        recalculado. Não é possível se a folha do mês já foi assinada ou fechada.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setClientId("");
            setReason("");
          }}
        >
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={!canSave} onClick={() => save.mutate()}>
          {save.isPending ? "A guardar…" : "Mudar cliente"}
        </Button>
      </div>
    </div>
  );
}
