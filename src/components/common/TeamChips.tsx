/** Ticket 172: atalhos "selecionar todo o setor / toda a equipa". */
import { Hash, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  numberGroups,
  sectorGroups,
  toggleTeam,
  type TeamGroup,
  type TeamMember,
} from "@/lib/teams";

function Row({
  label,
  icon: Icon,
  groups,
  selected,
  onChange,
}: {
  label: string;
  icon: typeof Users;
  groups: TeamGroup[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}:
      </span>
      {groups.map((t) => {
        const all = t.ids.every((id) => selected.includes(id));
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(toggleTeam(selected, t))}
            aria-pressed={all}
            title={all ? `Tirar ${t.name}` : `Selecionar todos de ${t.name}`}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              all
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:border-primary/60",
            )}
          >
            {t.name} <span className="opacity-70">({t.ids.length})</span>
          </button>
        );
      })}
    </div>
  );
}

export function TeamChips({
  members,
  selected,
  onChange,
  className,
}: {
  members: TeamMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const sectors = sectorGroups(members);
  const numbers = numberGroups(members);
  if (sectors.length === 0 && numbers.length === 0) return null;
  return (
    <div className={cn("space-y-1.5", className)} aria-label="Selecionar por setor ou equipa">
      <Row label="Setores" icon={Users} groups={sectors} selected={selected} onChange={onChange} />
      <Row label="Equipas" icon={Hash} groups={numbers} selected={selected} onChange={onChange} />
    </div>
  );
}
