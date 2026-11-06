import { describe, test, expect } from "bun:test";
import { MODULE_CATALOG, DEFAULT_ENABLED_MODULES, ESSENTIAL_MODULES, ROUTE_MODULES, normalizeBusinessVertical } from "@/lib/locale";
import { resolveAvailableNavigation, type NavContext } from "@/lib/navigation";

const base: NavContext = {
  effectiveRole: "manager",
  isSuperAdmin: false,
  companyId: "c1",
  vertical: "cleaning_services",
  enabledModules: ["core", "tasks"],
  employeeHasVehicle: false,
  contextReady: true,
};
const lojas = (ctx: NavContext) => resolveAvailableNavigation(ctx).groups.find((g) => g.id === "lojas");

describe("retail_core · configuração", () => {
  test("módulo opcional, desligado por omissão e preço 0", () => {
    expect(MODULE_CATALOG.retail_core.included).toBe(false);
    expect(MODULE_CATALOG.retail_core.addonMonthly).toBe(0);
    expect(DEFAULT_ENABLED_MODULES).not.toContain("retail_core");
    expect(ESSENTIAL_MODULES).not.toContain("retail_core");
  });
  test("vertical retail é reconhecida", () => {
    expect(normalizeBusinessVertical("retail")).toBe("retail");
  });
  test("rotas /app/lojas exigem retail_core", () => {
    expect(ROUTE_MODULES.find((r) => r.prefix === "/app/lojas")?.module).toBe("retail_core");
  });
  test("menu Lojas oculto sem o módulo e visível para manager/owner com o módulo", () => {
    expect(lojas(base)).toBeUndefined();
    const on = { ...base, enabledModules: ["core", "retail_core"] as NavContext["enabledModules"] };
    expect(lojas(on)?.items.map((i) => i.to)).toEqual(["/app/lojas", "/app/lojas/produtos", "/app/lojas/categorias", "/app/lojas/estoque"]);
    expect(lojas({ ...on, effectiveRole: "owner" })).toBeDefined();
  });
  test("employee e contabilista não veem Lojas nesta etapa", () => {
    const on = { ...base, enabledModules: ["core", "retail_core"] as NavContext["enabledModules"] };
    expect(lojas({ ...on, effectiveRole: "employee" })).toBeUndefined();
    expect(lojas({ ...on, effectiveRole: "accountant" })).toBeUndefined();
  });
});
