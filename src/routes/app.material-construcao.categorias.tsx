import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao/categorias")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_categories">
        <ComingSoon title="Categorias" desc="Categorias e famílias de produtos." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
