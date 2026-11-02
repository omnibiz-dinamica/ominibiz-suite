import { Instagram, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Canais — Etapa 1: só a apresentação. A ligação à Meta (Instagram/WhatsApp)
 * chega numa etapa seguinte; até lá o botão "Conectar" fica desativado.
 */
const CHANNELS = [
  {
    key: "instagram",
    name: "Instagram",
    icon: Instagram,
    desc: "Responda a comentários, mensagens diretas e respostas a stories.",
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    icon: MessageCircle,
    desc: "Atenda e automatize conversas no WhatsApp Business.",
  },
] as const;

export function ChannelsTab() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {CHANNELS.map((c) => (
        <li
          key={c.key}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <p className="font-medium">{c.name}</p>
            </div>
            <Badge variant="secondary">Desconectado</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{c.desc}</p>
          <div className="flex items-center gap-3">
            <Button disabled>Conectar</Button>
            <span className="text-xs text-muted-foreground">Disponível em breve</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
