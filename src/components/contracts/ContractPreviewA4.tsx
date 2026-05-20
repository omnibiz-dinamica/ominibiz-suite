import { useMemo } from "react";
import { renderAdvanced, highlightPending, listMissingVars, type NamespacedVars } from "@/lib/contract-vars";

export function ContractPreviewA4({
  body,
  vars,
  showPending = true,
}: {
  body: string;
  vars: NamespacedVars;
  showPending?: boolean;
}) {
  const { html, missing } = useMemo(() => {
    const rendered = renderAdvanced(body, vars);
    return {
      html: highlightPending(rendered),
      missing: listMissingVars(rendered),
    };
  }, [body, vars]);

  return (
    <div className="space-y-3">
      {showPending && missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">Variáveis pendentes ({missing.length})</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {missing.map((k) => (
              <code key={k} className="rounded bg-amber-200/70 px-1.5 py-0.5">{`{{${k}}}`}</code>
            ))}
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-[210mm] rounded-lg border border-border bg-white shadow-sm">
        <div
          className="prose prose-sm max-w-none p-[20mm] font-serif leading-relaxed text-slate-900 whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}