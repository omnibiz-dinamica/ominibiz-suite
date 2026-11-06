import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printReceipt } from "@/lib/retail-receipt";
import { loadSaleDetail } from "@/lib/retail-sales";
import { retailErrorMessage, useRetailCompany, useRetailUnits } from "@/lib/retail";

/** Carrega a venda gravada (valores do banco) e imprime o comprovativo. */
export function ReceiptButton({
  saleId,
  sellerName,
  variant = "outline",
}: {
  saleId: string;
  sellerName?: string | null;
  variant?: "outline" | "default" | "ghost";
}) {
  const { country, locale, currency } = useRetailCompany();
  const units = useRetailUnits();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const d = await loadSaleDetail(saleId);
      const u = units.data?.find((x) => x.id === d.sale.unit_id);
      const ok = printReceipt({
        sale: d.sale,
        items: d.items,
        payments: d.payments,
        store: {
          name: u?.name ?? "Loja",
          legal_name: u?.legal_name,
          tax_id: u?.tax_id,
          address: u?.address,
          city: u?.city,
          phone: u?.phone,
        },
        sellerName,
        country,
        locale,
        currency,
      });
      if (!ok)
        toast.error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    } catch (e) {
      toast.error(retailErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant={variant} disabled={busy} onClick={run}>
      <Printer className="mr-1 h-4 w-4" /> Comprovativo
    </Button>
  );
}
