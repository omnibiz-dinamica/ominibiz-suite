import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * OmniBiz · Fase 4 — Componente reutilizável para escolher funcionário.
 *
 * Reuso previsto: Tarefas, Reatribuição, RH, Férias, Despesas, Comercial,
 * Frota, Recibos, Contratos.
 *
 * Recursos:
 *   • Debounce de 180 ms no campo de busca.
 *   • Pesquisa por: Nome (`full_name`), Cargo (`job_title`), Equipe (`team`),
 *     Email (`email`) — cada campo é opcional; ausência não quebra a busca.
 *   • Janela virtual "leve" (slice + limite visível). Ativa-se automaticamente
 *     quando a lista filtrada excede `virtualThreshold` (default: 60).
 *   • Contrato de dados aberto: aceita qualquer objeto que expuser `id` e
 *     `full_name`; campos extras (email, job_title, team) enriquecem a busca
 *     sem exigir migração dos consumidores atuais.
 *   • Acessível: `role="combobox"`, foco visível, ENTER seleciona.
 */

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email?: string | null;
  job_title?: string | null;
  team?: string | null;
};

export interface EmployeePickerProps {
  employees: EmployeeOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Acima deste número, aplica virtual slice para manter render leve. */
  virtualThreshold?: number;
  /** Máx. itens renderizados em modo virtual (janela). */
  virtualWindowSize?: number;
  className?: string;
  /** Rótulo acessível do trigger. */
  ariaLabel?: string;
}

function useDebouncedValue<T>(value: T, delay = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function labelFor(e: EmployeeOption): string {
  return e.full_name?.trim() || e.email || e.id.slice(0, 8);
}

export function EmployeePicker({
  employees,
  value,
  onChange,
  placeholder = "Selecione um funcionário",
  emptyText = "Nenhum funcionário encontrado",
  disabled,
  virtualThreshold = 60,
  virtualWindowSize = 60,
  className,
  ariaLabel,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 180);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Foca no input ao abrir. rAF garante que o Popover já montou.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(debounced.trim());
    if (!q) return employees;
    const tokens = q.split(/\s+/g).filter(Boolean);
    return employees.filter((e) => {
      const haystack = [
        normalize(e.full_name),
        normalize(e.email),
        normalize(e.job_title),
        normalize(e.team),
      ].join(" ");
      return tokens.every((t) => haystack.includes(t));
    });
  }, [employees, debounced]);

  const isVirtual = filtered.length > virtualThreshold;
  const visible = isVirtual ? filtered.slice(0, virtualWindowSize) : filtered;

  const selected = value ? employees.find((e) => e.id === value) ?? null : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">
              {selected ? labelFor(selected) : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, cargo, equipe…"
              className="h-9 pl-8"
              aria-label="Buscar funcionário"
            />
          </div>
        </div>
        <ul
          role="listbox"
          className="max-h-72 overflow-y-auto py-1"
          aria-label="Funcionários"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            visible.map((e) => {
              const isSelected = e.id === value;
              const secondary = [e.job_title, e.team, e.email]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={e.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(e.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      isSelected && "bg-accent/50",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{labelFor(e)}</div>
                      {secondary && (
                        <div className="truncate text-xs text-muted-foreground">
                          {secondary}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
          {isVirtual && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">
              Mostrando {visible.length} de {filtered.length} · refine a busca
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export interface EmployeeMultiPickerProps {
  employees: EmployeeOption[];
  values: string[];
  onValuesChange: (ids: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Seletor múltiplo por UUID, mantendo a mesma busca e identidade do picker simples. */
export function EmployeeMultiPicker({
  employees,
  values,
  onValuesChange,
  placeholder = "Todos os funcionários",
  emptyText = "Nenhum funcionário encontrado",
  disabled,
  className,
  ariaLabel,
}: EmployeeMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 180);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIds = useMemo(() => new Set(values), [values]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(debounced.trim());
    if (!q) return employees;
    const tokens = q.split(/\s+/g).filter(Boolean);
    return employees.filter((e) => {
      const haystack = [normalize(e.full_name), normalize(e.email), normalize(e.job_title), normalize(e.team)].join(" ");
      return tokens.every((token) => haystack.includes(token));
    });
  }, [employees, debounced]);

  const selectedLabels = employees.filter((e) => selectedIds.has(e.id)).map(labelFor);
  const label = selectedLabels.length === 0
    ? placeholder
    : selectedLabels.length <= 2
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} funcionários selecionados`;

  const toggle = (id: string) => {
    onValuesChange(selectedIds.has(id) ? values.filter((value) => value !== id) : [...values, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, cargo, equipe…" className="h-9 pl-8" aria-label="Buscar funcionários" />
          </div>
        </div>
        <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1" aria-label="Funcionários">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
          ) : filtered.map((e) => {
            const isSelected = selectedIds.has(e.id);
            const secondary = [e.job_title, e.team, e.email].filter(Boolean).join(" · ");
            return (
              <li key={e.id} role="option" aria-selected={isSelected}>
                <button type="button" onClick={() => toggle(e.id)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", isSelected && "bg-accent/50")}>
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSelected && "border-primary bg-primary text-primary-foreground")}>
                    {isSelected && <Check className="h-3 w-3" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{labelFor(e)}</div>
                    {secondary && <div className="truncate text-xs text-muted-foreground">{secondary}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{values.length ? `${values.length} selecionado(s)` : "Nenhum selecionado"}</span>
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onValuesChange([])}>Limpar</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
