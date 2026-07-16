import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  FREQUENCY_LABELS,
  WEEKDAY_LABELS,
  type RecurrenceFrequency,
} from "@/lib/tasks";

export interface RecurrenceFormValue {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  dayOfMonth: number;
  startDate: string;
  endDate: string;
  scheduledTime: string;
  durationMinutes: number;
}

export const emptyRecurrence = (): RecurrenceFormValue => ({
  enabled: false,
  frequency: "weekly",
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  scheduledTime: "09:00",
  durationMinutes: 60,
});

export function RecurrenceForm({
  value,
  onChange,
  timingMode,
}: {
  value: RecurrenceFormValue;
  onChange: (v: RecurrenceFormValue) => void;
  /**
   * ADR-018 — Recorrência condicional por modo de apontamento do cliente:
   *  • `start_stop`  → recorrência clássica (horário + duração).
   *  • `manual`      → apenas datas; horário/duração ficam ocultos e
   *                    são normalizados no submit (00:00 / 0 min).
   *  • `undefined`   → comportamento legado (start_stop).
   */
  timingMode?: "start_stop" | "manual";
}) {
  const set = <K extends keyof RecurrenceFormValue>(k: K, v: RecurrenceFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const [open, setOpen] = useState(value.enabled);
  // Recorrência opera apenas com datas.
  // • start_stop: horário e duração herdados do topo do formulário (Início/Fim).
  // • manual:     horário preenchido pelo funcionário no apontamento.
  // Em ambos os modos, o bloco de recorrência exibe SOMENTE Data inicial / Data final.
  void timingMode;

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Recorrência</div>
          <div className="text-xs text-muted-foreground">
            {timingMode === "manual"
              ? "Cliente em modo Manual — apenas as datas são obrigatórias."
              : "Horários herdados do topo (Início/Fim). Configure apenas as datas."}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={value.enabled ? "default" : "outline"}
          onClick={() => {
            const next = !value.enabled;
            set("enabled", next);
            setOpen(next);
          }}
        >
          {value.enabled ? "Ativada" : "Ativar"}
        </Button>
      </div>

      {open && value.enabled && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <Label>Frequência</Label>
            <Select value={value.frequency} onValueChange={(v) => set("frequency", v as RecurrenceFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.frequency === "weekly" && (
            <div className="space-y-1.5">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((lbl, i) => {
                  const active = value.weekdays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? value.weekdays.filter((x) => x !== i)
                          : [...value.weekdays, i].sort();
                        set("weekdays", next);
                      }}
                      className={`h-9 w-9 rounded-md border text-sm font-medium transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.frequency === "monthly" && (
            <div className="space-y-1.5">
              <Label>Dia do mês</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={value.dayOfMonth}
                onChange={(e) => set("dayOfMonth", Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data inicial</Label>
              <Input type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data final (opcional)</Label>
              <Input type="date" value={value.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Sem data fim, a recorrência fica ativa até desligamento do funcionário,
            encerramento do cliente ou cancelamento manual.
          </p>
        </div>
      )}
    </div>
  );
}