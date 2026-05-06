import { Sparkles } from "lucide-react";

export function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md rounded-2xl border border-border bg-card p-10 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Em breve</p>
      </div>
    </div>
  );
}