import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Estado vazio no mesmo padrão visual do resto do OmniBiz (ex.: Clientes). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingBox() {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
      Carregando...
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
      <p className="text-destructive">{message}</p>
      <button type="button" className="mt-3 text-sm font-medium underline" onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  );
}
