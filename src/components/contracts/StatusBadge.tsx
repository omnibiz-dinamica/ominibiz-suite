import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from "@/lib/contract-vars";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        CONTRACT_STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {CONTRACT_STATUS_LABEL[status] ?? status}
    </span>
  );
}