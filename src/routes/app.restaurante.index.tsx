import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/restaurante/")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ComingSoon title="Restaurante · Dashboard" desc="Visão geral da operação do restaurante: vendas, pedidos e entregas." />
    </RoleGuard>
  ),
});
