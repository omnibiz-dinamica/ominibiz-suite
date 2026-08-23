import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_dashboard">
        <ComingSoon title="Material de Construção · Visão Geral" desc="Indicadores de estoque, vendas e entregas do vertical." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
