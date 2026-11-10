/**
 * Abrir o mês para conferência só para os funcionários escolhidos.
 * (10/11/2026: o botão antigo avisava TODOS os funcionários de uma vez.)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { TIMESHEET_STATUS_LABEL, monthLabel, type TimesheetStatus } from "@/lib/timesheet";

interface Member {
  id: string;
  full_name: string;
  company_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  year: number;
  month: number;
  /** Funcionários que já têm folha neste mês (não são escolhidos de novo). */
  existing: Map<string, TimesheetStatus>;
  pending: boolean;
  onConfirm: (employeeIds: string[]) => void;
}

export function OpenMonthDialog({
  open,
  onOpenChange,
  companyId,
  year,
  month,
  existing,
  pending,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const members = useQuery({
    queryKey: ["open-month-members", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("company_active_member_options");
      if (error) throw error;
      return ((data ?? []) as Member[])
        .filter((m) => m.company_id === companyId)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));
    },
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (members.data ?? []).filter((m) => !term || m.full_name.toLowerCase().includes(term));
  }, [members.data, q]);
  const selectable = list.filter((m) => !existing.has(m.id));

  const close = (v: boolean) => {
    if (!v) {
      setPicked([]);
      setQ("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <ModalHeader
          icon={CalendarPlus}
          title={`Abrir ${monthLabel(month, year)} para conferência`}
          description="Escolha os funcionários. Só os escolhidos recebem o aviso."
        />
        <ModalBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Procurar funcionário"
                className="pl-8"
                aria-label="Procurar funcionário"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={selectable.length === 0}
              onClick={() =>
                setPicked(Array.from(new Set([...picked, ...selectable.map((m) => m.id)])))
              }
            >
              Selecionar todos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={picked.length === 0}
              onClick={() => setPicked([])}
            >
              Limpar
            </Button>
          </div>

          {members.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando funcionários...</div>
          ) : members.isError ? (
            <div className="p-4 text-sm text-destructive">{(members.error as Error).message}</div>
          ) : list.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum funcionário encontrado.</div>
          ) : (
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {list.map((m) => {
                const st = existing.get(m.id);
                const checked = picked.includes(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      id={`om-${m.id}`}
                      checked={checked}
                      disabled={!!st}
                      onCheckedChange={(v) =>
                        setPicked((p) => (v ? [...p, m.id] : p.filter((x) => x !== m.id)))
                      }
                      aria-label={`Escolher ${m.full_name}`}
                    />
                    <label htmlFor={`om-${m.id}`} className="flex-1 cursor-pointer">
                      {m.full_name}
                    </label>
                    {st && (
                      <Badge variant="secondary">Já aberto · {TIMESHEET_STATUS_LABEL[st]}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button disabled={picked.length === 0 || pending} onClick={() => onConfirm(picked)}>
            <CalendarPlus className="h-4 w-4" />
            {pending
              ? "Abrindo..."
              : picked.length === 0
                ? "Escolha os funcionários"
                : `Abrir para ${picked.length} funcionário(s)`}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
