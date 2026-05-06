import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/app/notas")({ component: () => <ComingSoon title="Notas" desc="Controle de notas e documentos operacionais." /> });