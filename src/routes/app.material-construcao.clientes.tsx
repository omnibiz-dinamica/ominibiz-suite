import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao/clientes")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_customers">
        <ComingSoon title="Clientes" desc="Clientes de balcão e de obra." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
