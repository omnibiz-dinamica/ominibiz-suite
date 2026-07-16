import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";

// Layout de RH — protege TODAS as rotas /app/rh/* em uma única camada.
// Funcionário digitando /app/rh (ou qualquer filho) diretamente na URL
// é redirecionado; o menu deixa de ser mecanismo de segurança.
export const Route = createFileRoute("/app/rh")({
  component: () => (
    <RoleGuard allow={["manager", "owner", "super_admin"]}>
      <Outlet />
    </RoleGuard>
  ),
});