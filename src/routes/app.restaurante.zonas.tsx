import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/restaurante/zonas")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ComingSoon title="Zonas de Entrega" desc="Zonas, raios de cobertura e taxas de entrega." />
    </RoleGuard>
  ),
});
