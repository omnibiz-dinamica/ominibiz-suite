import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/app/assistente")({ component: () => <ComingSoon title="Assistente IA" desc="Operação assistida por IA — em construção." /> });