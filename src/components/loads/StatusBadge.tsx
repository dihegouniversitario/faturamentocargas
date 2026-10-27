import { cn } from "@/lib/utils";
import { STATUS_CLASS, STATUS_LABEL, type LoadStatus } from "@/lib/status";

export function StatusBadge({ status, className }: { status: LoadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-none",
        STATUS_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
