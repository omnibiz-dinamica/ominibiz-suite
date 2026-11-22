import { expect, test } from "bun:test";
import { resolveAvailableNavigation, type NavContext } from "../src/lib/navigation";

const base: NavContext = {
  effectiveRole: "employee",
  isSuperAdmin: false,
  companyId: "c1",
  vertical: "cleaning" as NavContext["vertical"],
  enabledModules: ["support"] as NavContext["enabledModules"],
  employeeHasVehicle: false,
  contextReady: true,
};
const supportItem = (ctx: NavContext) =>
  resolveAvailableNavigation(ctx).groups.flatMap((g) => g.items).find((i) => i.to === "/app/suporte");

test("22/11: funcionário vê 'Fale com a empresa'; gestão vê 'Meu Suporte' (mesma rota)", () => {
  expect(supportItem(base)?.label).toBe("Fale com a empresa");
  expect(supportItem({ ...base, effectiveRole: "manager" })?.label).toBe("Meu Suporte");
});
