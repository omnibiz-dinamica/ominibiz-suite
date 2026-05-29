import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Receipt, Download, FileText, Mail } from "lucide-react";
import { MONTH_LABEL_PT } from "@/lib/payslip-parser";

export const Route = createFileRoute("/app/meus-recibos")({ component: MyPayslipsPage });

type Payslip = {
  id: string; storage_path: string; original_filename: string;
  period_year: number | null; period_month: number | null;
  net_amount: number | null; gross_amount: number | null;
  status: "assigned" | "sent"; email_sent_at: string | null; created_at: string;
};

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function MyPayslipsPage() {
  const { user } = useAuth();
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");

  const { data: payslips = [] } = useQuery({
    queryKey: ["my-payslips", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("id, storage_path, original_filename, period_year, period_month, net_amount, gross_amount, status, email_sent_at, created_at")
        .eq("user_id", user!.id)
        .order("period_year", { ascending: false, nullsFirst: false })
        .order("period_month", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as Payslip[];
    },
  });

  const years = useMemo(() => Array.from(new Set(payslips.map((p) => p.period_year).filter(Boolean) as number[])).sort((a, b) => b - a), [payslips]);

  const filtered = payslips.filter((p) =>
    (year === "all" || p.period_year === parseInt(year, 10)) &&
    (month === "all" || p.period_month === parseInt(month, 10)),
  );

  const download = useMutation({
    mutationFn: async (p: Payslip) => {
      const { data, error } = await supabase.storage.from("payslips").createSignedUrl(p.storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao gerar link"),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Receipt className="h-6 w-6" /> Meus Recibos
        </h1>
        <p className="text-sm text-muted-foreground">Histórico de recibos disponibilizados pela sua empresa.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Ano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos anos</SelectItem>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos meses</SelectItem>
            {MONTH_LABEL_PT.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum recibo disponível ainda.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-semibold">
                    {p.period_month ? MONTH_LABEL_PT[p.period_month - 1] : "—"} {p.period_year ?? ""}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{p.original_filename}</div>
                </div>
                {p.status === "sent" && (
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600">
                    <Mail className="mr-1 h-3 w-3" /> Enviado
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Líquido</div>
                  <div className="text-xl font-semibold tabular-nums">{fmtMoney(p.net_amount)}</div>
                </div>
                <Button size="sm" onClick={() => download.mutate(p)}>
                  <Download className="mr-2 h-4 w-4" /> Baixar
                </Button>
              </div>
              {p.email_sent_at && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Enviado por email em {new Date(p.email_sent_at).toLocaleDateString("pt-PT")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}