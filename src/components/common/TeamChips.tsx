/** Ticket 172: atalhos "selecionar toda a equipa" (equipa = Setor do cadastro). */
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamGroups, toggleTeam, type TeamMember } from "@/lib/teams";

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
  const teams = teamGroups(members);
  if (teams.length === 0) return null;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="Selecionar por equipa"
    >
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden /> Equipas:
      </span>
      {teams.map((t) => {
        const all = t.ids.every((id) => selected.includes(id));
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(toggleTeam(selected, t))}
            aria-pressed={all}
            title={all ? `Tirar a equipa ${t.name}` : `Selecionar toda a equipa ${t.name}`}
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
