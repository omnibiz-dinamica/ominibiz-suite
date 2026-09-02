import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  customRecurrenceDateRange,
  dateKeyToLocalDate,
  localDateToDateKey,
  normalizeCustomRecurrenceDates,
} from "@/lib/tasks/custom-recurrence";
import {
  MONTH_POSITIONS,
  UI_FREQUENCY_LABELS,
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  describeRecurrence,
  previewRecurrenceDates,
  storedToUiFrequency,
  uiFrequencyToStored,
  type RecurrenceFrequency,
  type RecurrenceUiFrequency,
} from "@/lib/tasks";

export interface RecurrenceFormValue {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  /** RRULE FREQ=WEEKLY;INTERVAL=n — 2 = "semana sim, semana não". */
  intervalWeeks: number;
  weekdays: number[];
  dayOfMonth: number;
  /** Mensal por posição: 1..4 ou -1 (última). Null = regra por dia do mês. */
  monthPosition: number | null;
  /** Dia da semana (0=Dom) usado com `monthPosition`. */
  monthWeekday: number;
  startDate: string;
  endDate: string;
  /** Explicit date-only occurrences used when frequency is custom. */
  selectedDates: string[];
  scheduledTime: string;
  durationMinutes: number;
}

export const emptyRecurrence = (): RecurrenceFormValue => ({
  enabled: false,
  frequency: "weekly",
  intervalWeeks: 1,
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  monthPosition: null,
  monthWeekday: 5,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  selectedDates: [],
  // Sem defaults implícitos: horário/duração são derivados do topo do formulário
  // no submit (start_stop) ou fixados em 00:00 / 0 (manual). Nunca aplicar 60 min
  // como fallback silencioso.
  scheduledTime: "",
  durationMinutes: 0,
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
  const monthlyRule =
    value.monthPosition != null
      ? { position: value.monthPosition, weekday: value.monthWeekday }
      : { day_of_month: value.dayOfMonth };
  const uiFrequency = storedToUiFrequency(value.frequency, value.intervalWeeks, monthlyRule);
  const previewInput = {
    frequency: value.frequency,
    intervalWeeks: value.intervalWeeks,
    weekdays: value.weekdays,
    monthlyRule,
    startDate: value.startDate,
    endDate: value.endDate || null,
  };
  const customDates = normalizeCustomRecurrenceDates(value.selectedDates);
  const nextDates = value.enabled
    ? uiFrequency === "custom"
      ? customDates.slice(0, 5).flatMap((date) => {
          const parsed = dateKeyToLocalDate(date);
          return parsed ? [parsed] : [];
        })
      : previewRecurrenceDates(previewInput, 5)
    : [];
  // Recorrência opera apenas com datas.
  // • start_stop: horário e duração herdados do topo do formulário (Início/Fim).
  // • manual:     horário preenchido pelo funcionário no apontamento.
  // Em ambos os modos, o bloco de recorrência exibe SOMENTE Data inicial / Data final.

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
            <Select
              value={uiFrequency}
              onValueChange={(v) => {
                const stored = uiFrequencyToStored(v as RecurrenceUiFrequency);
                // "Semana sim, semana não" ancora no dia da semana da data inicial.
                const anchorDow = value.startDate
                  ? new Date(`${value.startDate}T12:00:00`).getDay()
                  : new Date().getDay();
                onChange({
                  ...value,
                  frequency: stored.frequency,
                  intervalWeeks: stored.intervalWeeks,
                  weekdays: v === "biweekly" ? [anchorDow] : value.weekdays,
                  selectedDates: [],
                  startDate: v === "custom" ? "" : value.startDate,
                  endDate: v === "custom" ? "" : value.endDate,
                  monthPosition:
                    v === "monthly_pos" ? (value.monthPosition ?? -1) : null,
                  monthWeekday: v === "monthly_pos" ? (value.monthPosition != null ? value.monthWeekday : anchorDow) : value.monthWeekday,
                });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["daily", "weekly", "biweekly", "monthly", "monthly_pos", "custom"] as RecurrenceUiFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>{UI_FREQUENCY_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{describeRecurrence(previewInput)}</p>
            {uiFrequency === "biweekly" && (
              <p className="text-[11px] text-muted-foreground">
                A semana da data inicial é a âncora: repete no mesmo dia da semana, saltando uma semana
                (semana sim → semana não → semana sim), até a data final.
              </p>
            )}
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

          {uiFrequency === "monthly" && (
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

          {uiFrequency === "monthly_pos" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Posição</Label>
                <Select
                  value={String(value.monthPosition ?? -1)}
                  onValueChange={(v) => set("monthPosition", Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_POSITIONS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dia da semana</Label>
                <Select value={String(value.monthWeekday)} onValueChange={(v) => set("monthWeekday", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_FULL.map((lbl, i) => (
                      <SelectItem key={i} value={String(i)}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {uiFrequency === "custom" && (
            <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div>
                <Label>Datas específicas</Label>
                <p className="text-[11px] text-muted-foreground">
                  Clique nos dias que deseja incluir. Clique novamente para remover; apenas os dias selecionados serão criados.
                </p>
              </div>
              <Calendar
                mode="multiple"
                selected={customDates.flatMap((date) => {
                  const parsed = dateKeyToLocalDate(date);
                  return parsed ? [parsed] : [];
                })}
                defaultMonth={dateKeyToLocalDate(customDates[0] ?? value.startDate) ?? new Date()}
                onSelect={(dates) => {
                  const selectedDates = normalizeCustomRecurrenceDates(
                    (dates ?? []).map(localDateToDateKey),
                  );
                  const range = customRecurrenceDateRange(selectedDates);
                  onChange({ ...value, selectedDates, startDate: range.startDate, endDate: range.endDate });
                }}
                className="mx-auto w-full max-w-sm rounded-md border bg-background"
              />
              <p className="text-xs font-medium">
                {customDates.length === 0
                  ? "Nenhuma data selecionada."
                  : `${customDates.length} data(s) selecionada(s): ${customDates.join(", ")}`}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{uiFrequency === "custom" ? "Primeira data" : "Data inicial"}</Label>
              <Input
                type="date"
                value={value.startDate}
                disabled={uiFrequency === "custom"}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{uiFrequency === "custom" ? "Última data" : "Data final (opcional)"}</Label>
              <Input
                type="date"
                value={value.endDate}
                disabled={uiFrequency === "custom"}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="text-xs font-medium">Próximas ocorrências</div>
            {nextDates.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {uiFrequency === "custom"
                  ? "Selecione pelo menos uma data no calendário."
                  : "Nenhuma ocorrência prevista com esta configuração."}
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {nextDates.map((d) => (
                  <li key={d.toISOString()}>
                    {d.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                  </li>
                ))}
              </ul>
            )}
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
