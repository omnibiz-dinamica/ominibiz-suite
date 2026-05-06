import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/app/ponto")({ component: () => <ComingSoon title="Folha de Ponto" desc="Check-in e check-out por evento, sem polling." /> });