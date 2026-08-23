import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ModuleGuard } from "@/components/ModuleGuard";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/material-construcao/fornecedores")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin", "employee"]}>
      <ModuleGuard module="building_materials_suppliers">
        <ComingSoon title="Fornecedores" desc="Cadastro e condições de fornecedores." />
      </ModuleGuard>
    </RoleGuard>
  ),
});
