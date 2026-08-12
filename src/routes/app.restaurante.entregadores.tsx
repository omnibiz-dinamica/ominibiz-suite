import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/restaurante/entregadores")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ComingSoon title="Entregadores" desc="Gestão de entregadores e disponibilidade." />
    </RoleGuard>
  ),
});
