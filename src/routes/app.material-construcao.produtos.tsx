import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao/produtos")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_products">
        <ComingSoon title="Produtos" desc="Catálogo de produtos, unidades e preços." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
