import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/app/notificacoes")({ component: () => <ComingSoon title="Notificações" desc="Tempo real, deep links e ações diretas." /> });