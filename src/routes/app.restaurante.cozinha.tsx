import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/restaurante/cozinha")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ComingSoon title="Cozinha" desc="Painel de produção da cozinha (KDS)." />
    </RoleGuard>
  ),
});
