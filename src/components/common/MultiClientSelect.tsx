import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export type ClientSelectOption = { id: string; name: string | null };

export interface MultiClientSelectProps {
  clients: readonly ClientSelectOption[];
  /** Selected client IDs (never names). */
  values: string[];
  onValuesChange: (ids: string[]) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  className?: string;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Reusable multi-select of clients with accent/case-insensitive search. */
export function MultiClientSelect({ clients, values, onValuesChange, loading, error, onRetry, className }: MultiClientSelectProps) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => new Set(values), [values]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const tokens = norm(query.trim()).split(/\s+/).filter(Boolean);
    if (!tokens.length) return clients;
    return clients.filter((c) => tokens.every((tk) => norm(c.name).includes(tk)));
  }, [clients, query]);

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const selectedIds = values.filter((id) => clients.some((c) => c.id === id) || !loading);
  const label =
    selectedIds.length === 0
      ? t("Todos os clientes")
      : selectedIds.length === 1
        ? nameOf(selectedIds[0])
        : t("{{n}} clientes", { n: selectedIds.length });

  const toggle = (id: string) =>
    onValuesChange(selected.has(id) ? values.filter((v) => v !== id) : [...values, id]);
  const selectAllResults = () => onValuesChange(Array.from(new Set([...values, ...filtered.map((c) => c.id)])));

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("Carregando clientes...")}
      </div>
    );
  } else if (error) {
    body = (
      <div className="space-y-2 px-3 py-6 text-center text-sm text-destructive">
        <p>{t("Não foi possível carregar os clientes.")}</p>
        {onRetry && (
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onRetry}>
            {t("Tentar novamente")}
          </Button>
        )}
      </div>
    );
  } else if (filtered.length === 0) {
    body = <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("Nenhum cliente encontrado")}</div>;
  } else {
    body = filtered.map((c) => {
      const isSel = selected.has(c.id);
      return (
        <CommandItem
          key={c.id}
          value={c.id}
          onSelect={() => toggle(c.id)}
          aria-selected={isSel}
          className="min-h-11 gap-2 md:min-h-9"
        >
          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSel && "border-primary bg-primary text-primary-foreground")}>
            {isSel && <Check className="h-3 w-3" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1 truncate" title={c.name ?? undefined}>{c.name}</span>
        </CommandItem>
      );
    });
  }

  const panel = (
    <Command shouldFilter={false} className="rounded-none">
      <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder={t("Buscar cliente…")} aria-label={t("Buscar cliente")} />
      <CommandList className={cn(isMobile ? "max-h-[55vh]" : "max-h-72")}>{body}</CommandList>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-2 text-xs">
        <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" disabled={loading || error || filtered.length === 0} onClick={selectAllResults}>
          {t("Selecionar todos os resultados")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" disabled={values.length === 0} onClick={() => onValuesChange([])}>
          {t("Limpar seleção")}
        </Button>
      </div>
    </Command>
  );

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={t("Filtrar por cliente")}
      className={cn("min-h-11 w-full justify-between font-normal md:min-h-9", className)}
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate" title={selectedIds.length ? selectedIds.map(nameOf).join(", ") : undefined}>{label}</span>
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
    </Button>
  );

  return (
    <div className="min-w-0 space-y-1.5">
      {isMobile ? (
        <>
          {trigger}
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent className="max-h-[85vh]">
              <DrawerTitle className="px-4 pt-2 text-base">{t("Filtrar por cliente")}</DrawerTitle>
              <div className="overflow-hidden pb-2">{panel}</div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
            {panel}
          </PopoverContent>
        </Popover>
      )}
      {selectedIds.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1">
          {selectedIds.map((id) => (
            <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-accent/40 py-0.5 pl-2 pr-0.5 text-xs">
              <span className="truncate" title={nameOf(id)}>{nameOf(id)}</span>
              <button
                type="button"
                onClick={() => onValuesChange(values.filter((v) => v !== id))}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-accent md:h-5 md:w-5"
                aria-label={t("Remover {{name}}", { name: nameOf(id) })}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
