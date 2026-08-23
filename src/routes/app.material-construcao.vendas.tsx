import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao/vendas")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_sales">
        <ComingSoon title="Vendas / PDV" desc="Vendas de balcão e ponto de venda." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
