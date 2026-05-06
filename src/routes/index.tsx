import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, Clock, Bell, Shield, Sparkles, Users } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const features = [
  { icon: ClipboardList, title: "Planejamento de Trabalho", desc: "Crie, atribua e acompanhe tarefas com status operacional claro." },
  { icon: Clock, title: "Folha de Ponto", desc: "Início e conclusão por evento, sem loops e sem polling." },
  { icon: Bell, title: "Notificações em Tempo Real", desc: "Deep links e ações diretas, sem fricção." },
  { icon: Users, title: "Hierarquia Multiempresa", desc: "Super Admin, Gestor e Funcionário com isolamento total." },
  { icon: Shield, title: "Regras no Backend", desc: "Lógica centralizada. A interface nunca decide o que importa." },
  { icon: Sparkles, title: "Pronto para IA", desc: "Estrutura preparada para assistente operacional e automações." },
];

function Landing() {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-display text-lg font-bold">O</div>
          <span className="font-display text-xl font-semibold tracking-tight">OmniBiz</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" asChild><Link to="/login">Entrar</Link></Button>
          <Button asChild><Link to="/signup">Começar grátis</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Operação inteligente para empresas modernas
          </div>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            A operação da sua empresa,{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">centralizada</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            OmniBiz é o sistema modular para reduzir falhas humanas com automações controladas.
            Comece com limpeza — escale para restaurantes, delivery e mais.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">Criar minha empresa <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>

        <div className="mt-24 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} OmniBiz · Plataforma SaaS multiempresa
      </footer>
    </div>
  );
}
