import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/restaurante/mesas")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ComingSoon title="Mesas" desc="Mapa de mesas, ocupação e reservas." />
    </RoleGuard>
  ),
});
